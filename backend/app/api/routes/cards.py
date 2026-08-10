"""
卡片 API 路由
"""

from fastapi import APIRouter, Query
from typing import Optional, List

from app.api.deps import DBSession, AIProvider
from app.core.exceptions import AppException, ErrorCode
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
    db: DBSession,
    ai_provider: AIProvider,
):
    """创建卡片（正文抽取 + AI 生成）"""
    service = CardService(db, ai_provider)

    # 若携带预览数据（title + ai_summary），走「预览保存」路径，
    # 跳过 AI 生成，保留用户在预览阶段编辑后的内容
    preview_data = None
    if request.title and request.ai_summary is not None:
        preview_data = {
            "title": request.title,
            "ai_summary": request.ai_summary,
            "key_points": request.key_points or [],
            "ai_tags": request.ai_tags or [],
        }

    try:
        card = await service.create_card(
            url=request.source_url,
            content=request.content,
            preview_data=preview_data,
        )
    except ValueError as exc:
        raise AppException(ErrorCode.CONTENT_EXTRACTION_FAILED, detail=str(exc))
    except Exception as exc:
        raise AppException(
            ErrorCode.CARD_GENERATION_FAILED,
            detail=f"卡片生成失败：{exc.__class__.__name__}",
        )

    return card


@router.get("", response_model=List[CardResponse])
async def list_cards(
    db: DBSession,
    ai_provider: AIProvider,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    tag: Optional[str] = None,
    days: Optional[int] = None,
):
    """获取卡片列表（标签/天数组合筛选；关键词搜索请走 /api/search）"""
    service = CardService(db, ai_provider)
    return await service.get_cards(skip=skip, limit=limit, tag=tag, days=days)


@router.get("/tags", response_model=List[TagCount])
async def list_tags(
    db: DBSession,
    ai_provider: AIProvider,
):
    """获取所有标签及其卡片计数（独立于卡片列表筛选）"""
    service = CardService(db, ai_provider)
    return await service.get_tags_with_count()


@router.get("/{card_id}", response_model=CardResponse)
async def get_card(
    card_id: int,
    db: DBSession,
    ai_provider: AIProvider,
):
    """获取单个卡片"""
    service = CardService(db, ai_provider)
    card = await service.get_card(card_id)
    if not card:
        raise AppException(ErrorCode.NOT_FOUND, detail="卡片不存在")
    return card


@router.put("/{card_id}", response_model=CardResponse)
async def update_card(
    card_id: int,
    update_data: CardUpdate,
    db: DBSession,
    ai_provider: AIProvider,
):
    """更新卡片"""
    service = CardService(db, ai_provider)
    card = await service.update_card(card_id, update_data)
    if not card:
        raise AppException(ErrorCode.NOT_FOUND, detail="卡片不存在")
    return card


@router.delete("/{card_id}", response_model=MessageResponse)
async def delete_card(
    card_id: int,
    db: DBSession,
    ai_provider: AIProvider,
):
    """删除卡片"""
    service = CardService(db, ai_provider)
    success = await service.delete_card(card_id)
    if not success:
        raise AppException(ErrorCode.NOT_FOUND, detail="卡片不存在")
    return MessageResponse(message="卡片已删除")


@router.post("/generate", response_model=CardGenerationResponse)
async def generate_card(
    request: CardGenerationRequest,
    db: DBSession,
    ai_provider: AIProvider,
):
    """
    生成卡片（仅返回 AI 结果，不保存）

    用于预览卡片内容
    """
    service = CardService(db, ai_provider)

    try:
        result = await service.generate_card_preview(
            request.url, content=request.content
        )
    except ValueError as exc:
        raise AppException(ErrorCode.CONTENT_EXTRACTION_FAILED, detail=str(exc))
    except Exception as exc:
        raise AppException(
            ErrorCode.CARD_GENERATION_FAILED,
            detail=f"卡片生成失败：{exc.__class__.__name__}",
        )

    return CardGenerationResponse(
        title=result["title"],
        summary=result["summary"],
        key_points=result["key_points"],
        tags=result["tags"],
    )
