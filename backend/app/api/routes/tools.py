"""
工具箱 API 路由
"""

from fastapi import APIRouter, Query
from typing import Optional, List

from app.api.deps import DBSession, AIProvider
from app.core.exceptions import AppException, ErrorCode
from app.services.tool_service import ToolService
from app.db.schemas.schemas import (
    ToolCreate,
    ToolUpdate,
    ToolResponse,
    ToolGenerationRequest,
    ToolGenerationResponse,
    MessageResponse,
    TagCount,
)

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.post("", response_model=ToolResponse)
async def create_tool(
    request: ToolCreate,
    db: DBSession,
    ai_provider: AIProvider,
):
    """收藏工具"""
    service = ToolService(db, ai_provider)
    return await service.create_tool(
        url=request.url,
        title=request.title,
        description=request.description,
        ai_tags=request.ai_tags,
        content=request.content,
    )


@router.get("", response_model=List[ToolResponse])
async def list_tools(
    db: DBSession,
    ai_provider: AIProvider,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    tag: Optional[str] = None,
    sort_by: str = Query("created_at", description="排序方式"),
):
    """获取工具列表（标签筛选 + 排序；关键词搜索请走 /api/search）"""
    service = ToolService(db, ai_provider)
    return await service.get_tools(skip=skip, limit=limit, tag=tag, sort_by=sort_by)


@router.get("/tags", response_model=List[TagCount])
async def list_tags(
    db: DBSession,
    ai_provider: AIProvider,
):
    """获取所有标签及其工具计数（独立于工具列表筛选）"""
    service = ToolService(db, ai_provider)
    return await service.get_tags_with_count()


@router.post("/generate", response_model=ToolGenerationResponse)
async def generate_tool(
    request: ToolGenerationRequest,
    db: DBSession,
    ai_provider: AIProvider,
):
    """
    生成工具信息（仅返回 AI 结果，不保存）

    AI 分析 URL 抓取的正文，生成工具名称、描述与标签，供前端预览。
    保存时把结果中的 title/tags 一并传给 POST /tools，跳过重复 AI 分类。
    """
    service = ToolService(db, ai_provider)

    try:
        result = await service.generate_tool_preview(
            request.url, content=request.content
        )
    except Exception as exc:
        raise AppException(
            ErrorCode.TOOL_GENERATION_FAILED,
            detail=f"工具信息生成失败：{exc.__class__.__name__}",
        )

    return ToolGenerationResponse(
        title=result["title"],
        description=result["description"],
        tags=result["tags"],
    )


@router.get("/{tool_id}", response_model=ToolResponse)
async def get_tool(
    tool_id: int,
    db: DBSession,
    ai_provider: AIProvider,
):
    """获取单个工具"""
    service = ToolService(db, ai_provider)
    tool = await service.get_tool(tool_id)
    if not tool:
        raise AppException(ErrorCode.NOT_FOUND, detail="工具不存在")
    return tool


@router.put("/{tool_id}", response_model=ToolResponse)
async def update_tool(
    tool_id: int,
    update_data: ToolUpdate,
    db: DBSession,
    ai_provider: AIProvider,
):
    """更新工具"""
    service = ToolService(db, ai_provider)
    tool = await service.update_tool(tool_id, update_data)
    if not tool:
        raise AppException(ErrorCode.NOT_FOUND, detail="工具不存在")
    return tool


@router.delete("/{tool_id}", response_model=MessageResponse)
async def delete_tool(
    tool_id: int,
    db: DBSession,
    ai_provider: AIProvider,
):
    """删除工具"""
    service = ToolService(db, ai_provider)
    success = await service.delete_tool(tool_id)
    if not success:
        raise AppException(ErrorCode.NOT_FOUND, detail="工具不存在")
    return MessageResponse(message="工具已删除")


@router.post("/{tool_id}/visit", response_model=ToolResponse)
async def increment_visit(
    tool_id: int,
    db: DBSession,
    ai_provider: AIProvider,
):
    """增加访问次数"""
    service = ToolService(db, ai_provider)
    tool = await service.increment_visit(tool_id)
    if not tool:
        raise AppException(ErrorCode.NOT_FOUND, detail="工具不存在")
    return tool
