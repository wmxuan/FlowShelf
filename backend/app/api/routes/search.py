"""
搜索 API 路由
"""

from fastapi import APIRouter, Query

from app.api.deps import DBSession, AIProvider
from app.services.search_service import SearchService
from app.db.schemas.schemas import SearchResponse

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def semantic_search(
    db: DBSession,
    ai_provider: AIProvider,
    q: str = Query(..., min_length=1, description="搜索查询"),
    type: str = Query("all", description="搜索类型：all | cards | tools"),
    limit: int = Query(20, ge=1, le=100),
    semantic: bool = Query(True, description="是否启用语义检索（基础模式传 false）"),
):
    """
    搜索（语义 + 关键词混合 / 纯关键词）
    """
    service = SearchService(db, ai_provider)
    results, total, semantic_used = await service.semantic_search(
        query=q,
        search_type=type,
        limit=limit,
        use_semantic=semantic,
    )
    return SearchResponse(results=results, total=total, query=q, semantic_used=semantic_used)
