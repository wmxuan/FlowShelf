"""
工具箱 API 路由
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.core.database import get_db
from app.core.config import get_settings
from app.providers.base import get_ai_provider
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
    db: AsyncSession = Depends(get_db),
):
    """收藏工具"""
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
    service = ToolService(db, ai_provider)

    tool = await service.create_tool(
        url=request.url,
        title=request.title,
        description=request.description,
        ai_tags=request.ai_tags,
        content=request.content,
    )

    return tool


@router.get("", response_model=List[ToolResponse])
async def list_tools(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    tag: Optional[str] = None,
    sort_by: str = Query("created_at", description="排序方式"),
    q: Optional[str] = Query(
        None, description="关键词搜索（提供时忽略 sort_by，按相关度排序）"
    ),
    db: AsyncSession = Depends(get_db),
):
    """获取工具列表（支持关键词搜索 + 标签组合筛选）"""
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
    service = ToolService(db, ai_provider)

    tools = await service.get_tools(
        skip=skip,
        limit=limit,
        tag=tag,
        sort_by=sort_by,
        q=q,
    )

    return tools


@router.get("/tags", response_model=List[TagCount])
async def list_tags(
    db: AsyncSession = Depends(get_db),
):
    """获取所有标签及其工具计数（独立于工具列表筛选）"""
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
    service = ToolService(db, ai_provider)
    return await service.get_tags_with_count()


@router.post("/generate", response_model=ToolGenerationResponse)
async def generate_tool(
    request: ToolGenerationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    生成工具信息（仅返回 AI 结果，不保存）

    AI 分析 URL 抓取的正文，生成工具名称、描述与标签，供前端预览。
    保存时把结果中的 title/tags 一并传给 POST /tools，跳过重复 AI 分类。
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
    service = ToolService(db, ai_provider)

    try:
        result = await service.generate_tool_preview(
            request.url, content=request.content
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"工具信息生成失败：{exc.__class__.__name__}"
        )

    return ToolGenerationResponse(
        title=result["title"],
        description=result["description"],
        tags=result["tags"],
    )


@router.get("/{tool_id}", response_model=ToolResponse)
async def get_tool(
    tool_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取单个工具"""
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
    service = ToolService(db, ai_provider)

    tool = await service.get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="工具不存在")

    return tool


@router.put("/{tool_id}", response_model=ToolResponse)
async def update_tool(
    tool_id: int,
    update_data: ToolUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新工具"""
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
    service = ToolService(db, ai_provider)

    tool = await service.update_tool(tool_id, update_data)
    if not tool:
        raise HTTPException(status_code=404, detail="工具不存在")

    return tool


@router.delete("/{tool_id}", response_model=MessageResponse)
async def delete_tool(
    tool_id: int,
    db: AsyncSession = Depends(get_db),
):
    """删除工具"""
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
    service = ToolService(db, ai_provider)

    success = await service.delete_tool(tool_id)
    if not success:
        raise HTTPException(status_code=404, detail="工具不存在")

    return MessageResponse(message="工具已删除")


@router.post("/{tool_id}/visit", response_model=ToolResponse)
async def increment_visit(
    tool_id: int,
    db: AsyncSession = Depends(get_db),
):
    """增加访问次数"""
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
    service = ToolService(db, ai_provider)

    tool = await service.increment_visit(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="工具不存在")

    return tool
