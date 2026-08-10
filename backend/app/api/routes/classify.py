"""
智能分流 API 路由

收藏时 AI 判断页面类型（文章 / 工具 / 视频），供扩展端展示分类结果供用户确认/修正。
复用 provider.classify_tool，与工具箱保存时的分类逻辑保持一致。
"""

from app.core.logging import get_logger

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.db.schemas.schemas import ClassifyRequest, ClassifyResponse
from app.providers.base import get_ai_provider
from app.services.tag_service import get_candidate_tags, normalize_tags
from app.tools.content_extractor import content_extractor

log = get_logger(__name__)

router = APIRouter(prefix="/api/classify", tags=["classify"])


@router.post("", response_model=ClassifyResponse)
async def classify_url(
    request: ClassifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    智能分流：分析 URL 页面内容，返回类型（article/tool/video）+ 标签。

    抓取失败时降级为 article，不阻断收藏流程。
    """
    settings = get_settings()
    ai_provider = get_ai_provider(
        demo_mode=settings.DEMO_MODE,
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
        model=settings.AI_MODEL,
        embedding_model=settings.EMBEDDING_MODEL,
        max_tokens=settings.AI_MAX_TOKENS,
        temperature=settings.AI_TEMPERATURE,
    )

    # Step 1: 抓取页面正文（失败降级为空正文，不阻断分类）
    # 扩展端可传入预先提取的正文（document.body.innerText），跳过后端抓取，
    # 规避反爬 / 重定向循环（TooManyRedirects 等）。
    content_text = ""
    extracted_title = request.title
    if request.content:
        content_text = request.content
        log.info("分流使用扩展端预提取正文（%d 字符）", len(content_text))
    else:
        try:
            extraction = await content_extractor.extract(request.url)
            if extraction.success:
                content_text = extraction.content
                if not extracted_title:
                    extracted_title = extraction.title
            else:
                log.warning("分流抓取失败，降级为 url+title 分类: %s", extraction.error)
        except Exception as exc:  # noqa: BLE001
            log.warning("分流抓取异常，降级为 url+title 分类: %s", exc)

    # Step 2: AI 分类
    candidates = await get_candidate_tags(db, "tools", top_n=30)
    try:
        result = await ai_provider.classify_tool(
            request.url,
            extracted_title or "",
            content_text,
            candidate_tags=candidates,
        )
        classified_type = result["type"]
        tags = normalize_tags(result["tags"], candidates)
    except Exception as exc:  # noqa: BLE001
        log.warning("AI 分类失败，降级为 article: %s", exc)
        classified_type = "article"
        tags = []

    return ClassifyResponse(
        type=classified_type,
        tags=tags,
        title=extracted_title,
    )
