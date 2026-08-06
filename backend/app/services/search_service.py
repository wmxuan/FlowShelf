"""
语义搜索服务层

当前环境（deepseek）无 Embedding API，_hash_embedding 生成的伪向量无语义，
余弦相似度为随机值。因此采用 jieba 分词 + 关键词加权匹配作为检索方案。
待接入独立 Embedding 服务后，可切回向量检索或混合检索（_cosine_similarity 已保留）。
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Tuple
import math

import jieba

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
        搜索（jieba 分词 + 关键词加权匹配）

        Args:
            query: 搜索查询
            search_type: 搜索类型（all | cards | tools）
            limit: 返回数量

        Returns:
            (搜索结果列表, 总数)，无关键词匹配的结果不返回
        """
        results = []

        # 搜索卡片
        if search_type in ("all", "cards"):
            cards = await self._get_all_cards_with_embedding()
            for card in cards:
                score = self._keyword_score(
                    query, card.title, card.ai_tags or [], card.ai_summary
                )
                if score > 0:
                    results.append(
                        SearchResult(
                            id=card.id,
                            title=card.title,
                            url=card.source_url,
                            type="card",
                            summary=card.ai_summary,
                            tags=card.ai_tags or [],
                            score=score,
                        )
                    )

        # 搜索工具箱
        if search_type in ("all", "tools"):
            tools = await self._get_all_tools()
            for tool in tools:
                score = self._keyword_score(
                    query, tool.title, tool.ai_tags or [], tool.description or ""
                )
                if score > 0:
                    results.append(
                        SearchResult(
                            id=tool.id,
                            title=tool.title,
                            url=tool.url,
                            type="tool",
                            summary=tool.description,
                            tags=tool.ai_tags or [],
                            score=score,
                        )
                    )

        # 按相关度排序
        results.sort(key=lambda x: x.score, reverse=True)

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
    def _extract_terms(query: str) -> List[str]:
        """用 jieba 分词提取检索词，英文转小写"""
        terms = [w.strip() for w in jieba.cut(query) if w.strip()]
        return [t.lower() if t.isascii() else t for t in terms]

    @staticmethod
    def _keyword_score(query: str, title: str, tags: List[str], summary: str) -> float:
        """关键词匹配打分（0-1），无匹配返回 0。

        权重：标题 = 标签 > 摘要（标签是 AI 精心打的，语义价值高）。
        综合覆盖率（匹配词比例）与匹配位置权重。
        """
        terms = SearchService._extract_terms(query)
        if not terms:
            return 0.0

        title_l = (title or "").lower()
        tags_l = " ".join(tags or []).lower()
        summary_l = (summary or "").lower()

        matched = 0
        weight_sum = 0.0
        for term in terms:
            if term in title_l:
                matched += 1
                weight_sum += 3.0
            elif term in tags_l:
                matched += 1
                weight_sum += 3.0
            elif term in summary_l:
                matched += 1
                weight_sum += 1.0

        if matched == 0:
            return 0.0

        coverage = matched / len(terms)
        avg_weight = weight_sum / (matched * 3.0)
        return coverage * 0.6 + avg_weight * 0.4

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
