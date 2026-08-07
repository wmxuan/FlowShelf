"""
卡片 API 路由
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.core.database import get_db
from app.core.config import get_settings
from app.providers.base import get_ai_provider
from app.services.card_service import CardService
from app.db.schemas.schemas import (
    CardCreate,
    CardUpdate,
    CardResponse,
    CardGenerationRequest,
    CardGenerationResponse,
    MessageResponse,
    TagCount,
)

router = APIRouter(prefix="/api/cards", tags=["cards"])


@router.post("", response_model=CardResponse)
async def create_card(
    request: CardCreate,
    db: AsyncSession = Depends(get_db),
):
    """创建卡片（正文抽取 + AI 生成）"""
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
    service = CardService(db, ai_provider)

    try:
        card = await service.create_card(url=request.source_url)
    except ValueError as exc:
        # 正文抽取失败 → 422，给用户清晰反馈
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        # AI 调用或数据库失败 → 502，不暴露内部细节
        raise HTTPException(
            status_code=502, detail=f"卡片生成失败：{exc.__class__.__name__}"
        )

    return card


@router.get("", response_model=List[CardResponse])
async def list_cards(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    tag: Optional[str] = None,
    days: Optional[int] = None,
    q: Optional[str] = Query(None, description="关键词搜索（提供时忽略标签筛选优先级，按相关度排序）"),
    db: AsyncSession = Depends(get_db),
):
    """获取卡片列表（支持关键词搜索 + 标签/天数组合筛选）"""
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
    service = CardService(db, ai_provider)

    cards = await service.get_cards(
        skip=skip,
        limit=limit,
        tag=tag,
        days=days,
        q=q,
    )

    return cards


@router.get("/tags", response_model=List[TagCount])
async def list_tags(
    db: AsyncSession = Depends(get_db),
):
    """获取所有标签及其卡片计数（独立于卡片列表筛选）"""
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
    service = CardService(db, ai_provider)
    return await service.get_tags_with_count()


@router.get("/{card_id}", response_model=CardResponse)
async def get_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取单个卡片"""
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
    service = CardService(db, ai_provider)

    card = await service.get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")

    return card


@router.put("/{card_id}", response_model=CardResponse)
async def update_card(
    card_id: int,
    update_data: CardUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新卡片"""
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
    service = CardService(db, ai_provider)

    card = await service.update_card(card_id, update_data)
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")

    return card


@router.delete("/{card_id}", response_model=MessageResponse)
async def delete_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
):
    """删除卡片"""
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
    service = CardService(db, ai_provider)

    success = await service.delete_card(card_id)
    if not success:
        raise HTTPException(status_code=404, detail="卡片不存在")

    return MessageResponse(message="卡片已删除")


@router.post("/generate", response_model=CardGenerationResponse)
async def generate_card(
    request: CardGenerationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    生成卡片（仅返回 AI 结果，不保存）

    用于预览卡片内容
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
    service = CardService(db, ai_provider)

    try:
        result = await service.generate_card_preview(request.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"卡片生成失败：{exc.__class__.__name__}"
        )

    return CardGenerationResponse(
        summary=result["summary"], key_points=result["key_points"], tags=result["tags"]
    )
