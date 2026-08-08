"""
待学习队列 API 路由

核心端点：
- POST /api/learning  — 快速保存（<500ms 返回，AI 后台异步补全）
- GET  /api/learning  — 获取列表
- GET  /api/learning/{id} — 获取详情
- POST /api/learning/{id}/convert — 转为卡片/工具
- POST /api/learning/{id}/enrich — 手动触发 AI 补全
- DELETE /api/learning/{id} — 删除
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.core.database import get_db
from app.core.config import get_settings
from app.providers.base import get_ai_provider
from app.services.learning_service import LearningService
from app.db.schemas.schemas import (
    LearningItemCreate,
    LearningItemResponse,
    LearningItemConvertRequest,
    LearningItemUpdateRequest,
    MessageResponse,
)

router = APIRouter(prefix="/api/learning", tags=["learning"])


def _make_service(db: AsyncSession) -> LearningService:
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
    return LearningService(db, ai_provider)


@router.post("", response_model=LearningItemResponse)
async def create_learning_item(
    request: LearningItemCreate,
    db: AsyncSession = Depends(get_db),
):
    """快速保存到待学习队列（<500ms 返回，AI 后台异步补全）"""
    service = _make_service(db)
    try:
        item = await service.create_item(request)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"保存失败：{exc.__class__.__name__}",
        )
    return item


@router.get("", response_model=List[LearningItemResponse])
async def list_learning_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    include_converted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """获取待学习项列表"""
    service = _make_service(db)
    return await service.list_items(
        skip=skip, limit=limit, include_converted=include_converted
    )


@router.get("/{item_id}", response_model=LearningItemResponse)
async def get_learning_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取单个待学习项"""
    service = _make_service(db)
    item = await service.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="待学习项不存在")
    return item


@router.post("/{item_id}/convert", response_model=LearningItemResponse)
async def convert_learning_item(
    item_id: int,
    request: LearningItemConvertRequest,
    db: AsyncSession = Depends(get_db),
):
    """将待学习项转换为卡片/工具"""
    service = _make_service(db)
    overwrite = request.model_dump(exclude_unset=True) or None
    try:
        item = await service.convert_item(item_id, overwrite)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"转换失败：{exc.__class__.__name__}: {exc}",
        )
    if not item:
        raise HTTPException(status_code=404, detail="待学习项不存在")
    return item


@router.post("/{item_id}/enrich", response_model=LearningItemResponse)
async def enrich_learning_item(
    item_id: int,
    request: Optional[dict] = None,
    db: AsyncSession = Depends(get_db),
):
    """手动触发 AI 补全"""
    service = _make_service(db)
    content = (request or {}).get("content", "")
    try:
        item = await service.trigger_enrich(item_id, content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI 补全失败：{exc.__class__.__name__}: {exc}",
        )
    if not item:
        raise HTTPException(status_code=404, detail="待学习项不存在")
    return item


@router.delete("/{item_id}", response_model=MessageResponse)
async def delete_learning_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
):
    """删除待学习项"""
    service = _make_service(db)
    success = await service.delete_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="待学习项不存在")
    return MessageResponse(message="已删除")


@router.put("/{item_id}", response_model=LearningItemResponse)
async def update_learning_item(
    item_id: int,
    request: LearningItemUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """编辑待学习项的 AI 生成内容（标题/摘要/关键观点/标签/工具描述）"""
    service = _make_service(db)
    update_data = request.model_dump(exclude_unset=True) or None
    item = await service.update_item(item_id, update_data or {})
    if not item:
        raise HTTPException(status_code=404, detail="待学习项不存在")
    return item
