"""
AI Provider 抽象层

支持真实模式（调用 LLM API）和 DEMO 模式（返回模拟数据）

兼容性说明：
- 使用 JSON mode（response_format=json_object）而非 OpenAI 结构化输出（json_schema），
  保证 DeepSeek / 通义千问 / Moonshot 等 OpenAI 兼容服务都能用
- Embedding 由独立的 LocalEmbeddingProvider（bge-small-zh-v1.5 本地模型）负责，
  零外部 API 依赖、永不停用。DeepSeek 仅负责摘要/标签生成，不负责向量。
- Embedding 调用失败时优雅降级为 hash 向量，不阻断建卡流程
"""

import asyncio
import hashlib
import json
import logging
import os
from abc import ABC, abstractmethod
from functools import lru_cache
from typing import List, Optional

from openai import AsyncOpenAI, APIError, APITimeoutError, RateLimitError

from app.db.schemas.ai_schemas import (
    CardAIOutput,
    ToolClassificationOutput,
    ToolGenerationOutput,
)

logger = logging.getLogger(__name__)

_PROMPT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")


@lru_cache()
def _load_prompt(name: str) -> str:
    """从 app/prompts/ 加载 Prompt 文本，缓存结果"""
    path = os.path.join(_PROMPT_DIR, f"{name}.txt")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _hash_embedding(text: str, dim: int = 1536) -> List[float]:
    """无 Embedding API 时的兜底：基于文本 hash 生成伪向量（不可用于真实语义检索）"""
    hash_bytes = hashlib.md5(text.encode()).digest()
    base = [b / 255.0 for b in hash_bytes]
    return (base * (dim // 16 + 1))[:dim]


class BaseAIProvider(ABC):
    """AI Provider 基类"""

    def __init__(self, embedding_provider=None):
        """
        Args:
            embedding_provider: 可选的本地 Embedding Provider 实例（LocalEmbeddingProvider）。
                                注入后 generate_embedding / embed_texts 会委托给它，
                                避免依赖 LLM 供应商的 Embedding API（DeepSeek 不支持）。
        """
        self._embedding_provider = embedding_provider

    @abstractmethod
    async def generate_card(
        self, url: str, content: str, candidate_tags: Optional[List[str]] = None
    ) -> dict:
        """
        生成知识卡片

        Args:
            candidate_tags: 现有高频标签，注入 Prompt 引导 AI 优先复用，抑制标签膨胀

        Returns:
            {
                "title": str,
                "summary": str,
                "key_points": List[str],
                "tags": List[str],
                "embedding": List[float]
            }
        """
        pass

    async def generate_embedding(
        self, text: str, is_query: bool = False
    ) -> List[float]:
        """生成单条文本的向量

        Args:
            text: 文本
            is_query: 是否是搜索 query。bge 模型对 query 推荐加前缀以提升检索效果。
                      文档建库时传 False，搜索时传 True。

        默认实现：委托给注入的 embedding_provider（同步转异步）。
        子类可覆盖以接入其他 Embedding 服务（如 OpenAI API）。
        """
        if self._embedding_provider is not None:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                lambda: self._embedding_provider.embed_text(text, is_query=is_query),
            )
        raise NotImplementedError("未配置 Embedding Provider")

    async def embed_texts(
        self, texts: List[str], is_query: bool = False
    ) -> List[List[float]]:
        """批量生成向量（回填脚本用，加速存量数据）

        默认实现：委托给 embedding_provider 的批量接口。
        """
        if self._embedding_provider is not None:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                lambda: self._embedding_provider.embed_texts(texts, is_query=is_query),
            )
        # 兜底：逐条生成
        return [await self.generate_embedding(t, is_query=is_query) for t in texts]

    async def safe_generate_embedding(
        self, text: str, is_query: bool = False
    ) -> List[float]:
        """安全的向量生成：失败时降级为 hash 向量，不抛异常。

        供 search_service 等需要容错的场景调用，避免 Embedding 服务不可用
        导致接口 500。
        """
        try:
            return await self.generate_embedding(text, is_query=is_query)
        except Exception as exc:
            logger.warning("Embedding 降级为 hash 向量：%s", exc)
            return _hash_embedding(text)

    @abstractmethod
    async def classify_tool(
        self,
        url: str,
        title: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """
        分类工具（用于智能分流）

        Args:
            candidate_tags: 现有高频标签，注入 Prompt 引导 AI 优先复用，抑制标签膨胀

        Returns:
            {"type": str, "tags": List[str]}
        """
        pass

    @abstractmethod
    async def generate_tool(
        self,
        url: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """
        AI 生成工具信息（标题 + 描述 + 标签），用于预览，不写库

        Args:
            url: 工具 URL
            content: 抓取到的页面正文
            candidate_tags: 现有高频标签，注入 Prompt 引导 AI 优先复用，抑制标签膨胀

        Returns:
            {"title": str, "description": str, "tags": List[str]}
        """
        pass

    async def group_tabs(self, tabs: List[dict]) -> dict:
        """
        AI Tab 归组：将多个标签页按主题相似度聚类分组

        Args:
            tabs: 标签页列表，每个元素含 url, title

        Returns:
            {"groups": [{"name": str, "tab_indices": [int, ...]}, ...]}
        """
        raise NotImplementedError("group_tabs 未在子类中实现")

    async def assign_tab_to_group(self, tab: dict, existing_groups: List[dict]) -> dict:
        """
        AI 单标签分组：将一个新标签页分配到已有分组或创建新分组（省 token）

        Args:
            tab: 新标签页 {"url": str, "title": str}
            existing_groups: 已有分组 [{"name": str, "sample_tabs": [{"url", "title"}, ...]}, ...]

        Returns:
            {"action": "assign"|"create", "group_name": str}
        """
        raise NotImplementedError("assign_tab_to_group 未在子类中实现")


class RealAIProvider(BaseAIProvider):
    """真实 AI Provider（调用 OpenAI 兼容 API）"""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        embedding_model: str = "text-embedding-3-small",
        base_url: str = "",
        max_tokens: int = 500,
        temperature: float = 0.3,
        embedding_provider=None,
    ):
        super().__init__(embedding_provider=embedding_provider)
        client_kwargs = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url
        self.client = AsyncOpenAI(**client_kwargs)
        self.model = model
        self.embedding_model = embedding_model
        self.max_tokens = max_tokens
        self.temperature = temperature

    async def generate_card(
        self, url: str, content: str, candidate_tags: Optional[List[str]] = None
    ) -> dict:
        """调用 LLM 生成卡片（JSON mode + Pydantic 校验 + Embedding 降级）"""
        # 1. 加载并填充 Prompt（注入候选标签库，引导 AI 优先复用）
        prompt_template = _load_prompt("card_generation")
        user_prompt = prompt_template.format(
            url=url,
            content=content or "(正文为空)",
            candidate_tags="、".join(candidate_tags) if candidate_tags else "（暂无）",
        )

        # 2. 调用 LLM（JSON mode，兼容 DeepSeek 等非 OpenAI 服务）
        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是 FlowShelf 的知识策展助手，必须严格按 JSON 格式输出。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=self.max_tokens,
                temperature=self.temperature,
            )
        except APITimeoutError:
            raise RuntimeError("AI 调用超时")
        except RateLimitError:
            raise RuntimeError("AI 调用触发限流，请稍后重试")
        except APIError as exc:
            raise RuntimeError(f"AI 调用失败：{exc.__class__.__name__}: {exc}")

        raw = completion.choices[0].message.content or ""

        # 3. 解析 JSON + Pydantic 校验
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError(f"AI 返回非合法 JSON：{raw[:200]}")

        try:
            parsed = CardAIOutput.model_validate(data)
        except Exception as exc:
            raise RuntimeError(f"AI 输出校验失败：{exc}")

        # 4. 生成 embedding（失败时降级为 hash 向量，不阻断建卡）
        embed_text = "\n".join([parsed.title, parsed.summary, *parsed.key_points])
        embedding = await self.safe_generate_embedding(embed_text)

        return {
            "title": parsed.title,
            "summary": parsed.summary,
            "key_points": parsed.key_points,
            "tags": parsed.tags,
            "embedding": embedding,
        }

    async def generate_embedding(
        self, text: str, is_query: bool = False
    ) -> List[float]:
        """生成向量：优先用本地 embedding_provider，否则走 OpenAI 兼容 API

        Args:
            text: 文本
            is_query: 是否是搜索 query（仅对本地 bge 模型生效）
        """
        # 优先用本地 Embedding Provider（bge-small-zh-v1.5），零外部依赖、永不停用
        if self._embedding_provider is not None:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                lambda: self._embedding_provider.embed_text(text, is_query=is_query),
            )
        # 兜底：走 OpenAI 兼容 API（DeepSeek 不支持 embeddings，会抛 RuntimeError，
        # 由 safe_generate_embedding 降级为 hash 向量）
        try:
            resp = await self.client.embeddings.create(
                model=self.embedding_model,
                input=text,
            )
            return resp.data[0].embedding
        except (APITimeoutError, RateLimitError, APIError) as exc:
            raise RuntimeError(f"Embedding 生成失败：{exc.__class__.__name__}")

    async def classify_tool(
        self,
        url: str,
        title: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """调用 LLM 分类工具（JSON mode + 候选标签库注入）"""
        # 加载 Prompt 模板并注入候选标签库，引导 AI 优先复用现有标签
        prompt_template = _load_prompt("tool_classification")
        user_prompt = prompt_template.format(
            url=url,
            title=title,
            content=(content or "")[:2500],
            candidate_tags="、".join(candidate_tags) if candidate_tags else "（暂无）",
        )

        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是 FlowShelf 的收藏分流助手，必须严格按 JSON 格式输出。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=200,
                temperature=0.0,
            )
        except (APITimeoutError, RateLimitError, APIError) as exc:
            logger.warning("AI 分类失败，降级为 article：%s", exc)
            return {"type": "article", "tags": []}

        try:
            data = json.loads(completion.choices[0].message.content or "{}")
            parsed = ToolClassificationOutput.model_validate(data)
            return {"type": parsed.type, "tags": parsed.tags}
        except Exception:
            logger.warning("AI 分类输出解析失败，降级为 article")
            return {"type": "article", "tags": []}

    async def generate_tool(
        self,
        url: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """调用 LLM 生成工具信息（标题 + 描述 + 标签），用于预览"""
        prompt_template = _load_prompt("tool_generation")
        user_prompt = prompt_template.format(
            url=url,
            content=(content or "")[:2000],
            candidate_tags="、".join(candidate_tags) if candidate_tags else "（暂无）",
        )

        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是 FlowShelf 的工具箱策展助手，必须严格按 JSON 格式输出。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=300,
                temperature=self.temperature,
            )
        except APITimeoutError:
            raise RuntimeError("AI 调用超时")
        except RateLimitError:
            raise RuntimeError("AI 调用触发限流，请稍后重试")
        except APIError as exc:
            raise RuntimeError(f"AI 调用失败：{exc.__class__.__name__}: {exc}")

        raw = completion.choices[0].message.content or ""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError(f"AI 返回非合法 JSON：{raw[:200]}")

        try:
            parsed = ToolGenerationOutput.model_validate(data)
        except Exception as exc:
            raise RuntimeError(f"AI 输出校验失败：{exc}")

        return {
            "title": parsed.title,
            "description": parsed.description,
            "tags": parsed.tags,
        }

    async def group_tabs(self, tabs: List[dict]) -> dict:
        """AI Tab 归组：将多个标签页按主题相似度聚类分组"""
        prompt_template = _load_prompt("tab_grouping")
        tabs_text = "\n".join(
            f"[{i}] {t.get('title', '(无标题)')} | {t.get('url', '')}"
            for i, t in enumerate(tabs)
        )
        user_prompt = prompt_template.format(tabs=tabs_text)

        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是 FlowShelf 的 Tab 归组助手，必须严格按 JSON 格式输出。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=500,
                temperature=0.0,
            )
        except APITimeoutError:
            raise RuntimeError("AI 调用超时")
        except RateLimitError:
            raise RuntimeError("AI 调用触发限流，请稍后重试")
        except APIError as exc:
            raise RuntimeError(f"AI 调用失败：{exc.__class__.__name__}: {exc}")

        raw = completion.choices[0].message.content or ""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError(f"AI 返回非合法 JSON：{raw[:200]}")

        groups = data.get("groups", [])
        if not groups:
            raise RuntimeError("AI 未返回有效分组")

        return {"groups": groups}

    async def assign_tab_to_group(self, tab: dict, existing_groups: List[dict]) -> dict:
        """AI 单标签分组：将一个新标签页分配到已有分组或创建新分组（省 token）"""
        # 无已有分组时直接创建新组，不调用 LLM
        if not existing_groups:
            return {"action": "create", "group_name": "新标签"}

        prompt_template = _load_prompt("tab_assign")
        groups_text = "\n".join(
            f"- {g['name']}（{g.get('count', 0)} 个标签，示例：{g.get('sample_tabs', ['无'])[0].get('title', '无') if g.get('sample_tabs') else '无'}）"
            for g in existing_groups
        )
        user_prompt = prompt_template.format(
            title=tab.get("title", "(无标题)"),
            url=tab.get("url", ""),
            groups=groups_text,
        )

        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是 FlowShelf 的 Tab 归组助手，必须严格按 JSON 格式输出。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=100,
                temperature=0.0,
            )
        except (APITimeoutError, RateLimitError, APIError) as exc:
            logger.warning("AI 单标签分组失败，降级为创建新组：%s", exc)
            return {"action": "create", "group_name": "新标签"}

        raw = completion.choices[0].message.content or ""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("AI 单标签分组返回非合法 JSON，降级为创建新组")
            return {"action": "create", "group_name": "新标签"}

        action = data.get("action", "create")
        group_name = data.get("group_name", "新标签")

        # assign 时校验 group_name 是否存在于已有分组
        if action == "assign":
            existing_names = {g["name"] for g in existing_groups}
            if group_name not in existing_names:
                logger.warning("AI 返回的 group_name 不在已有分组中，降级为创建新组")
                return {"action": "create", "group_name": "新标签"}

        return {"action": action, "group_name": group_name}


class DemoAIProvider(BaseAIProvider):
    """DEMO 模式 AI Provider（返回模拟数据）"""

    async def generate_card(
        self, url: str, content: str, candidate_tags: Optional[List[str]] = None
    ) -> dict:
        """返回模拟卡片数据"""
        return {
            "title": f"来自 {url[:30]} 的卡片",
            "summary": f"这是对文章《{content[:50]}...》的摘要。文章主要讨论了相关技术的核心原理和最佳实践，为读者提供了全面的参考。",
            "key_points": [
                "核心观点 1：技术选型需要综合考虑成本和性能",
                "核心观点 2：良好的架构设计是项目成功的关键",
                "核心观点 3：持续的迭代和优化比一次性完美更重要",
            ],
            "tags": ["技术", "架构", "最佳实践"],
            "embedding": [0.1] * 1536,
        }

    async def generate_embedding(
        self, text: str, is_query: bool = False
    ) -> List[float]:
        """返回模拟向量"""
        return _hash_embedding(text)

    async def classify_tool(
        self,
        url: str,
        title: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """返回模拟分类结果"""
        url_lower = url.lower()
        if any(
            keyword in url_lower for keyword in ["tool", "app", "dashboard", "console"]
        ):
            return {"type": "tool", "tags": ["工具", "常用"]}
        elif any(keyword in url_lower for keyword in ["video", "youtube", "bilibili"]):
            return {"type": "video", "tags": ["视频"]}
        else:
            return {"type": "article", "tags": ["文章", "待学习"]}

    async def generate_tool(
        self,
        url: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """返回模拟工具生成数据"""
        from urllib.parse import urlparse

        try:
            host = urlparse(url).netloc.replace("www.", "")
        except Exception:
            host = url[:30]
        return {
            "title": f"来自 {host} 的工具",
            "description": "这是一个在线工具，可帮助用户高效完成特定任务。",
            "tags": ["工具", "常用"],
        }

    async def group_tabs(self, tabs: List[dict]) -> dict:
        """DEMO 模式 Tab 归组：按域名分组，同域名下不同路径自动细分

        策略：
        1. 提取主域名（如 github.com、stackoverflow.com）
        2. 同域名下，如果路径有明显分类（如 /questions、/pull、/issues），
           按路径前缀细分（同前缀归一组）
        3. 同域名下标签少于 3 个时，不细分，全部归入域名组
        """
        from collections import defaultdict
        from urllib.parse import urlparse

        # 按域名收集
        domain_tabs: dict[str, list[tuple[int, dict]]] = defaultdict(list)
        for i, t in enumerate(tabs):
            try:
                host = urlparse(t.get("url", "")).netloc.replace("www.", "")
                domain_tabs[host or "其他"].append((i, t))
            except Exception:
                domain_tabs["其他"].append((i, t))

        groups = []
        for domain, indexed_tabs in domain_tabs.items():
            if domain == "其他" or len(indexed_tabs) <= 2:
                # 少量标签不细分
                groups.append(
                    {
                        "name": f"{domain} 相关" if domain != "其他" else "其他",
                        "tab_indices": [idx for idx, _ in indexed_tabs],
                    }
                )
                continue

            # 同域名下尝试按路径前缀细分
            path_groups: dict[str, list[int]] = defaultdict(list)
            for idx, t in indexed_tabs:
                try:
                    path = urlparse(t.get("url", "")).path.strip("/")
                    # 取路径第一段作为分类（如 /questions、/pull、/issues）
                    first_segment = path.split("/")[0] if path else ""
                    # 常见分类关键词映射
                    if first_segment in ("questions", "q", "a"):
                        key = "问答"
                    elif first_segment in ("pull", "pulls", "issues", "merge_requests"):
                        key = "代码协作"
                    elif first_segment in (
                        "docs",
                        "wiki",
                        "documentation",
                        "guide",
                        "guides",
                    ):
                        key = "文档"
                    elif first_segment in (
                        "blog",
                        "posts",
                        "article",
                        "articles",
                        "news",
                    ):
                        key = "文章/博客"
                    elif first_segment in ("search", "results", "find"):
                        key = "搜索结果"
                    elif first_segment in ("settings", "config", "profile", "account"):
                        key = "设置/配置"
                    elif first_segment:
                        key = first_segment
                    else:
                        key = "首页/浏览"
                except Exception:
                    key = "其他"
                path_groups[key].append(idx)

            if len(path_groups) <= 1:
                # 无需细分
                groups.append(
                    {
                        "name": f"{domain} 相关",
                        "tab_indices": [idx for idx, _ in indexed_tabs],
                    }
                )
            else:
                for segment, indices in path_groups.items():
                    groups.append(
                        {
                            "name": f"{domain} · {segment}",
                            "tab_indices": indices,
                        }
                    )

        return {"groups": groups}

    async def assign_tab_to_group(self, tab: dict, existing_groups: List[dict]) -> dict:
        """DEMO 模式单标签分组：按域名匹配已有分组，否则创建新组"""
        from urllib.parse import urlparse

        if not existing_groups:
            return {"action": "create", "group_name": "新标签"}

        try:
            new_domain = urlparse(tab.get("url", "")).netloc.replace("www.", "")
        except Exception:
            new_domain = ""

        for g in existing_groups:
            sample_tabs = g.get("sample_tabs", [])
            for st in sample_tabs:
                try:
                    domain = urlparse(st.get("url", "")).netloc.replace("www.", "")
                    if domain and domain == new_domain:
                        return {"action": "assign", "group_name": g["name"]}
                except Exception:
                    continue

        return {
            "action": "create",
            "group_name": f"{new_domain} 相关" if new_domain else "新标签",
        }


def _create_embedding_provider_from_settings():
    """根据 settings 创建 Embedding Provider，未启用返回 None

    - EMBEDDING_PROVIDER=local: 创建 LocalEmbeddingProvider（bge-small-zh-v1.5 单例）
    - EMBEDDING_PROVIDER=openai: 返回 None，走 OpenAI 兼容 API（DeepSeek 不支持会降级）
    """
    from app.core.config import get_settings

    settings = get_settings()
    if settings.EMBEDDING_PROVIDER == "local":
        from app.providers.local_embedding import get_local_embedding_provider

        return get_local_embedding_provider(settings.EMBEDDING_LOCAL_MODEL)
    return None


def get_ai_provider(
    demo_mode: bool = True,
    api_key: str = "",
    base_url: str = "",
    model: str = "gpt-4o-mini",
    embedding_model: str = "text-embedding-3-small",
    max_tokens: int = 500,
    temperature: float = 0.3,
    embedding_provider=None,
) -> BaseAIProvider:
    """获取 AI Provider 实例

    embedding_provider 未传入时，自动根据 settings.EMBEDDING_PROVIDER 创建：
    - local: 注入 LocalEmbeddingProvider（bge-small-zh-v1.5，零外部依赖）
    - openai: 不注入，走 OpenAI 兼容 API（DeepSeek 不支持，会降级 hash 向量）

    智能模式切换：
    - 即使 DEMO_MODE=true，如果 OPENAI_API_KEY 有效（非占位符），自动升级为 RealAIProvider
    - 保证 AI 功能（分组、摘要等）在配置了 key 时始终可用
    """
    # 有效 API key 判断：非空且不是占位符
    _PLACEHOLDER_KEYS = {"sk-test-placeholder", "sk-test", "sk-placeholder", ""}
    has_valid_key = bool(api_key) and api_key not in _PLACEHOLDER_KEYS

    if demo_mode and not has_valid_key:
        return DemoAIProvider()

    # 未显式传入 embedding_provider 时，根据 settings 自动创建
    if embedding_provider is None:
        embedding_provider = _create_embedding_provider_from_settings()

    return RealAIProvider(
        api_key=api_key,
        model=model,
        embedding_model=embedding_model,
        base_url=base_url,
        max_tokens=max_tokens,
        temperature=temperature,
        embedding_provider=embedding_provider,
    )
