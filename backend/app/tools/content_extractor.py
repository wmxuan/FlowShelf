"""
网页正文抽取工具

设计目标：
- 处理主流网站（博客 / 新闻 / 文档），剥离导航 / 广告 / 评论 / 侧边栏
- 单次抽取超时 ≤ CONTENT_TIMEOUT 秒（默认 10s）
- 输出字符数 ≤ MAX_CONTENT_LENGTH（默认 50000）
- 单模块失败不拖垮整条链路：任何异常都返回带 success=False 的 ExtractionResult

技术方案：
- httpx 异步抓取（浏览器 UA + 重定向跟随）
- trafilatura 主路径：自动识别正文 + 元数据（标题 / 作者 / 日期）
- bs4 兜底：trafilatura 抽不出正文时退化为基础清洗
"""

from __future__ import annotations

from app.core.logging import get_logger
from typing import Optional

import httpx
import trafilatura
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from app.core.config import get_settings

log = get_logger(__name__)

# 浏览器伪装 UA：很多站点对默认 httpx UA 直接 403
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
_DEFAULT_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}
# 抓取上限 5MB，防止恶意超大页面拖垮服务
_MAX_RESPONSE_BYTES = 5 * 1024 * 1024


class ExtractionResult(BaseModel):
    """正文抽取结果"""

    success: bool = Field(..., description="抽取是否成功")
    url: str = Field(..., description="最终 URL（跟随重定向后）")
    title: Optional[str] = Field(None, description="页面标题")
    content: str = Field(default="", description="正文内容（markdown）")
    content_type: str = Field(
        default="article", description="内容类型：article | video | document"
    )
    author: Optional[str] = Field(None, description="作者")
    published_date: Optional[str] = Field(None, description="发布日期（ISO 字符串）")
    error: Optional[str] = Field(None, description="失败时的错误信息")
    content_length: int = Field(0, description="实际抽取的字符数")


class ContentExtractor:
    """网页正文抽取器"""

    def __init__(
        self,
        timeout: Optional[int] = None,
        max_content_length: Optional[int] = None,
    ):
        settings = get_settings()
        self.timeout = timeout if timeout is not None else settings.CONTENT_TIMEOUT
        self.max_content_length = (
            max_content_length
            if max_content_length is not None
            else settings.MAX_CONTENT_LENGTH
        )

    async def extract(self, url: str) -> ExtractionResult:
        """
        抓取并抽取页面正文。

        任何异常都不会抛出，统一封装为 ExtractionResult(success=False)。
        """
        if not url or not url.startswith(("http://", "https://")):
            return ExtractionResult(
                success=False, url=url, error="URL 无效，必须以 http(s):// 开头"
            )

        # Step 1: 抓取 HTML
        html, final_url, fetch_error = await self._fetch(url)
        if fetch_error or not html:
            return ExtractionResult(
                success=False, url=url, error=fetch_error or "抓取到的 HTML 为空"
            )

        # Step 2: trafilatura 主路径抽取
        try:
            result = self._extract_with_trafilatura(html, final_url)
            if result.success and result.content:
                return result
            log.info("trafilatura 抽取为空，降级到 bs4: %s", final_url)
        except Exception as exc:  # noqa: BLE001 - 兜底所有异常
            log.warning("trafilatura 抽取异常: %s | url=%s", exc, final_url)

        # Step 3: bs4 兜底
        try:
            result = self._extract_with_bs4(html, final_url)
            if result.success:
                return result
        except Exception as exc:  # noqa: BLE001
            log.warning("bs4 兜底异常: %s | url=%s", exc, final_url)

        return ExtractionResult(
            success=False,
            url=final_url,
            title=self._extract_title_only(html),
            error="无法从页面抽取正文（可能是纯 SPA / 需登录 / 反爬）",
        )

    # ------------------------------------------------------------------
    # 内部实现
    # ------------------------------------------------------------------

    async def _fetch(self, url: str) -> tuple[Optional[str], str, Optional[str]]:
        """异步抓取 HTML，返回 (html, final_url, error)"""
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=5.0),
                follow_redirects=True,
                max_redirects=5,
                headers=_DEFAULT_HEADERS,
            ) as client:
                # 流式读取，超过 _MAX_RESPONSE_BYTES 即中止，避免下载超大文件
                async with client.stream("GET", url) as resp:
                    if resp.status_code >= 400:
                        return None, str(resp.url), f"HTTP {resp.status_code}"
                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in resp.aiter_bytes():
                        total += len(chunk)
                        if total > _MAX_RESPONSE_BYTES:
                            return None, str(resp.url), "响应体超过 5MB 上限"
                        chunks.append(chunk)
                    raw = b"".join(chunks)
                    # trafilatura / bs4 都能处理编码，交给它们自动探测
                    html = raw.decode(resp.encoding or "utf-8", errors="replace")
                    return html, str(resp.url), None
        except httpx.TimeoutException:
            return None, url, f"请求超时（{self.timeout}s）"
        except httpx.InvalidURL:
            return None, url, "URL 格式非法"
        except httpx.HTTPError as exc:
            return None, url, f"网络错误：{exc.__class__.__name__}"
        except Exception as exc:  # noqa: BLE001
            return None, url, f"未知抓取错误：{exc.__class__.__name__}"

    def _extract_with_trafilatura(self, html: str, url: str) -> ExtractionResult:
        """主路径：trafilatura 抽取正文 + 元数据"""
        # trafilatura 2.x 返回 Document 对象，调用 .as_dict() 转 dict
        document = trafilatura.bare_extraction(
            html,
            url=url,
            output_format="markdown",
            include_links=True,
            include_tables=True,
            include_images=False,
            no_fallback=False,  # 内部也启用 justext 兜底
        )
        if not document:
            return ExtractionResult(success=False, url=url)

        # Document 对象 → dict（trafilatura 2.x 推荐 .as_dict()）
        extracted = (
            document.as_dict() if hasattr(document, "as_dict") else dict(document)
        )

        text: str = (extracted.get("text") or "").strip()
        title: Optional[str] = (extracted.get("title") or "").strip() or None
        author: Optional[str] = (extracted.get("author") or "").strip() or None
        date_raw: Optional[str] = extracted.get("date") or None

        if not text:
            return ExtractionResult(success=False, url=url, title=title)

        text = self._truncate(text)
        content_type = self._detect_content_type(url, extracted)

        return ExtractionResult(
            success=True,
            url=url,
            title=title,
            content=text,
            content_type=content_type,
            author=author,
            published_date=date_raw,
            content_length=len(text),
        )

    def _extract_with_bs4(self, html: str, url: str) -> ExtractionResult:
        """兜底路径：bs4 剥离非正文标签后取 body 文本"""
        soup = BeautifulSoup(html, "lxml")

        # 移除明显非正文区块
        for tag in soup(
            [
                "script",
                "style",
                "noscript",
                "nav",
                "header",
                "footer",
                "aside",
                "form",
                "iframe",
            ]
        ):
            tag.decompose()
        # 移除常见广告 / 评论 class
        for selector in [
            "[class*='comment']",
            "[class*='ad-']",
            "[id*='sidebar']",
            "[role='banner']",
            "[role='navigation']",
        ]:
            for el in soup.select(selector):
                el.decompose()

        title = self._extract_title_only(html)
        body = soup.find("main") or soup.find("article") or soup.body
        if not body:
            return ExtractionResult(success=False, url=url, title=title)

        # 保留段落结构
        lines: list[str] = []
        for el in body.find_all(["h1", "h2", "h3", "p", "li", "blockquote", "pre"]):
            text = el.get_text(separator=" ", strip=True)
            if text and len(text) > 1:
                lines.append(text)

        content = "\n\n".join(lines)
        content = self._truncate(content)
        if len(content) < 50:
            return ExtractionResult(success=False, url=url, title=title)

        return ExtractionResult(
            success=True,
            url=url,
            title=title,
            content=content,
            content_type=self._detect_content_type(url, {}),
            content_length=len(content),
        )

    def _truncate(self, text: str) -> str:
        """按 MAX_CONTENT_LENGTH 截断，尽量在段落边界截断"""
        if len(text) <= self.max_content_length:
            return text
        truncated = text[: self.max_content_length]
        # 尝试在最后一个换行处截断，避免半句
        last_break = truncated.rfind("\n")
        if last_break > self.max_content_length * 0.8:
            truncated = truncated[:last_break]
        return truncated.rstrip() + "\n\n[内容已截断]"

    def _detect_content_type(self, url: str, extracted: dict) -> str:
        """简单识别内容类型"""
        url_lower = url.lower()
        if any(
            k in url_lower
            for k in ["youtube.com", "bilibili.com", "vimeo.com", "/video/"]
        ):
            return "video"
        # trafilatura 元数据里有时会带 type
        if extracted.get("type") == "video":
            return "video"
        return "article"

    def _extract_title_only(self, html: str) -> Optional[str]:
        """仅提取 <title> 或 <h1>"""
        try:
            soup = BeautifulSoup(html, "lxml")
            if soup.title and soup.title.string:
                return soup.title.string.strip()
            h1 = soup.find("h1")
            if h1:
                return h1.get_text(strip=True)
        except Exception:  # noqa: BLE001
            pass
        return None


# 模块级单例，供 service 层直接 import 使用
content_extractor = ContentExtractor()
