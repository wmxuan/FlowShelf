"""
搜索 API 路由
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.core.config import get_settings
from app.providers.base import get_ai_provider
from app.services.search_service import SearchService
from app.db.schemas.schemas import SearchResponse

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def semantic_search(
    q: str = Query(..., min_length=1, description="搜索查询"),
    type: str = Query("all", description="搜索类型：all | cards | tools"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    语义搜索
    
    用自然语言描述你要找的内容，AI 会进行语义匹配
    """
    settings = get_settings()
    ai_provider = get_ai_provider(
        demo_mode=settings.DEMO_MODE,
        api_key=settings.OPENAI_API_KEY
    )
    service = SearchService(db, ai_provider)
    
    results, total = await service.semantic_search(
        query=q,
        search_type=type,
        limit=limit,
    )
    
    return SearchResponse(
        results=results,
        total=total,
        query=q
    )