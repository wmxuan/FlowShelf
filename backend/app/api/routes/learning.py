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

from fastapi import APIRouter, Query
from typing import Optional, List

from app.api.deps import DBSession, AIProvider
from app.core.exceptions import AppException, ErrorCode
from app.services.learning_service import LearningService
from app.db.schemas.schemas import (
    LearningItemCreate,
    LearningItemResponse,
    LearningItemConvertRequest,
    LearningItemUpdateRequest,
    MessageResponse,
)

router = APIRouter(prefix="/api/learning", tags=["learning"])


@router.post("", response_model=LearningItemResponse)
async def create_learning_item(
    request: LearningItemCreate,
    db: DBSession,
    ai_provider: AIProvider,
):
    """快速保存到待学习队列（<500ms 返回，AI 后台异步补全）"""
    service = LearningService(db, ai_provider)
    try:
        item = await service.create_item(request)
    except Exception as exc:
        raise AppException(
            ErrorCode.LEARNING_SAVE_FAILED,
            detail=f"保存失败：{exc.__class__.__name__}",
        )
    return item


@router.get("", response_model=List[LearningItemResponse])
async def list_learning_items(
    db: DBSession,
    ai_provider: AIProvider,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    include_converted: bool = Query(False),
):
    """获取待学习项列表"""
    service = LearningService(db, ai_provider)
    return await service.list_items(
        skip=skip, limit=limit, include_converted=include_converted
    )


@router.get("/{item_id}", response_model=LearningItemResponse)
async def get_learning_item(
    item_id: int,
    db: DBSession,
    ai_provider: AIProvider,
):
    """获取单个待学习项"""
    service = LearningService(db, ai_provider)
    item = await service.get_item(item_id)
    if not item:
        raise AppException(ErrorCode.NOT_FOUND, detail="待学习项不存在")
    return item


@router.post("/{item_id}/convert", response_model=LearningItemResponse)
async def convert_learning_item(
    item_id: int,
    request: LearningItemConvertRequest,
    db: DBSession,
    ai_provider: AIProvider,
):
    """将待学习项转换为卡片/工具"""
    service = LearningService(db, ai_provider)
    overwrite = request.model_dump(exclude_unset=True) or None
    try:
        item = await service.convert_item(item_id, overwrite)
    except ValueError as exc:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail=str(exc))
    except Exception as exc:
        raise AppException(
            ErrorCode.LEARNING_CONVERT_FAILED,
            detail=f"转换失败：{exc.__class__.__name__}: {exc}",
        )
    if not item:
        raise AppException(ErrorCode.NOT_FOUND, detail="待学习项不存在")
    return item


@router.post("/{item_id}/enrich", response_model=LearningItemResponse)
async def enrich_learning_item(
    item_id: int,
    request: Optional[dict] = None,
    db: DBSession = None,
    ai_provider: AIProvider = None,
):
    """手动触发 AI 补全"""
    service = LearningService(db, ai_provider)
    content = (request or {}).get("content", "")
    try:
        item = await service.trigger_enrich(item_id, content)
    except ValueError as exc:
        raise AppException(ErrorCode.VALIDATION_ERROR, detail=str(exc))
    except Exception as exc:
        raise AppException(
            ErrorCode.LEARNING_ENRICH_FAILED,
            detail=f"AI 补全失败：{exc.__class__.__name__}: {exc}",
        )
    if not item:
        raise AppException(ErrorCode.NOT_FOUND, detail="待学习项不存在")
    return item


@router.delete("/{item_id}", response_model=MessageResponse)
async def delete_learning_item(
    item_id: int,
    db: DBSession,
    ai_provider: AIProvider,
):
    """删除待学习项"""
    service = LearningService(db, ai_provider)
    success = await service.delete_item(item_id)
    if not success:
        raise AppException(ErrorCode.NOT_FOUND, detail="待学习项不存在")
    return MessageResponse(message="已删除")


@router.put("/{item_id}", response_model=LearningItemResponse)
async def update_learning_item(
    item_id: int,
    request: LearningItemUpdateRequest,
    db: DBSession,
    ai_provider: AIProvider,
):
    """编辑待学习项的 AI 生成内容（标题/摘要/关键观点/标签/工具描述）"""
    service = LearningService(db, ai_provider)
    update_data = request.model_dump(exclude_unset=True) or None
    item = await service.update_item(item_id, update_data or {})
    if not item:
        raise AppException(ErrorCode.NOT_FOUND, detail="待学习项不存在")
    return item
