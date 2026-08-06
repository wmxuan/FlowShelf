"""
语义搜索服务层
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Tuple
import math

from app.db.models.models import Card, Tool
from app.db.schemas.schemas import SearchResult
from app.providers.base import BaseAIProvider


class SearchService:
    """语义搜索服务"""
    
    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider
    
    async def semantic_search(
        self,
        query: str,
        search_type: str = "all",
        limit: int = 20,
    ) -> Tuple[List[SearchResult], int]:
        """
        语义搜索
        
        Args:
            query: 搜索查询
            search_type: 搜索类型（all | cards | tools）
            limit: 返回数量
            
        Returns:
            (搜索结果列表, 总数)
        """
        # 1. 生成查询向量
        query_embedding = await self.ai_provider.generate_embedding(query)
        
        results = []
        
        # 2. 搜索卡片
        if search_type in ("all", "cards"):
            cards = await self._get_all_cards_with_embedding()
            for card in cards:
                if card.embedding:
                    score = self._cosine_similarity(query_embedding, card.embedding)
                    results.append(SearchResult(
                        id=card.id,
                        title=card.title,
                        url=card.source_url,
                        type="card",
                        summary=card.ai_summary,
                        tags=card.ai_tags or [],
                        score=score,
                    ))
        
        # 3. 搜索工具箱
        if search_type in ("all", "tools"):
            tools = await self._get_all_tools()
            for tool in tools:
                # 工具没有 embedding，用标签做简单匹配
                tool_embedding = await self.ai_provider.generate_embedding(
                    f"{tool.title} {' '.join(tool.ai_tags or [])}"
                )
                score = self._cosine_similarity(query_embedding, tool_embedding)
                results.append(SearchResult(
                    id=tool.id,
                    title=tool.title,
                    url=tool.url,
                    type="tool",
                    summary=tool.description,
                    tags=tool.ai_tags or [],
                    score=score,
                ))
        
        # 4. 按相关度排序
        results.sort(key=lambda x: x.score, reverse=True)
        
        # 5. 限制返回数量
        total = len(results)
        results = results[:limit]
        
        return results, total
    
    async def _get_all_cards_with_embedding(self) -> List[Card]:
        """获取所有有 embedding 的卡片"""
        query = select(Card).where(Card.embedding.isnot(None))
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def _get_all_tools(self) -> List[Tool]:
        """获取所有工具"""
        query = select(Tool)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
        """
        计算余弦相似度
        
        Args:
            v1: 向量 1
            v2: 向量 2
            
        Returns:
            相似度分数（0-1）
        """
        if len(v1) != len(v2):
            # 长度不同，截断到较短的长度
            min_len = min(len(v1), len(v2))
            v1 = v1[:min_len]
            v2 = v2[:min_len]
        
        # 计算点积
        dot_product = sum(a * b for a, b in zip(v1, v2))
        
        # 计算模长
        magnitude_v1 = math.sqrt(sum(a * a for a in v1))
        magnitude_v2 = math.sqrt(sum(b * b for b in v2))
        
        # 避免除以零
        if magnitude_v1 == 0 or magnitude_v2 == 0:
            return 0.0
        
        # 计算余弦相似度
        return dot_product / (magnitude_v1 * magnitude_v2)