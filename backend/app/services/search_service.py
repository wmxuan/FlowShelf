"""
语义搜索服务层

混合检索策略（向量 + 关键词）：
- 优先用向量余弦相似度（语义匹配，解决「UI」搜不到「蓝湖」的语义鸿沟）
- 混合关键词分数（精确匹配兜底，避免向量检索漏掉实体名/编号）
- 无 embedding 或维度不匹配的老数据降级为纯关键词

权重：向量 × 0.7 + 关键词 × 0.3
阈值：向量分数 ≥ 0.5 或关键词匹配，才进入结果集
"""

from app.core.logging import get_logger
import math
from typing import List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.models import Card, Tool
from app.db.schemas.schemas import SearchResult
from app.providers.base import BaseAIProvider
from app.services.search_utils import keyword_score

log = get_logger(__name__)


class SearchService:
    """语义搜索服务"""

    # 混合检索权重
    VECTOR_WEIGHT = 0.7
    KEYWORD_WEIGHT = 0.3
    # 向量最低阈值：低于此值且关键词也无匹配时不返回，避免噪声
    # 0.3 对中文短查询偏低（"快看看"等泛化短语会与大量弱相关内容产生 0.3~0.5 相似度，
    # 导致召回率拉满但精度崩盘）。0.5 在 bge 中文模型上接近"明显相关"的分界线。
    MIN_VEC_THRESHOLD = 0.5

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
        混合检索（向量 + 关键词）

        Args:
            query: 搜索查询
            search_type: 搜索类型（all | cards | tools）
            limit: 返回数量

        Returns:
            (搜索结果列表, 总数)，无匹配的结果不返回
        """
        results = []

        # 1. 生成 query embedding（用于向量检索；失败降级为纯关键词）
        query_embedding = await self._get_query_embedding(query)

        # 2. 搜索卡片
        if search_type in ("all", "cards"):
            cards = await self._get_all_cards()
            for card in cards:
                score = self._compute_hybrid_score(
                    query,
                    query_embedding,
                    card.embedding,
                    card.title,
                    card.ai_tags or [],
                    card.ai_summary,
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
                            key_points=card.key_points or [],
                            created_at=card.created_at,
                        )
                    )

        # 3. 搜索工具箱
        if search_type in ("all", "tools"):
            tools = await self._get_all_tools()
            for tool in tools:
                score = self._compute_hybrid_score(
                    query,
                    query_embedding,
                    tool.embedding,
                    tool.title,
                    tool.ai_tags or [],
                    tool.description or "",
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
                            visit_count=tool.visit_count,
                            last_visited_at=tool.last_visited_at,
                        )
                    )

        # 4. 按相关度排序
        results.sort(key=lambda x: x.score, reverse=True)

        total = len(results)
        results = results[:limit]

        return results, total

    async def _get_query_embedding(self, query: str) -> Optional[List[float]]:
        """生成 query 的向量（is_query=True，bge 推荐加前缀）

        失败返回 None，降级为纯关键词搜索。
        """
        try:
            return await self.ai_provider.generate_embedding(query, is_query=True)
        except Exception as exc:
            log.warning("Query embedding 生成失败，降级为纯关键词搜索：%s", exc)
            return None

    def _compute_hybrid_score(
        self,
        query: str,
        query_embedding: Optional[List[float]],
        doc_embedding: Optional[List[float]],
        title: str,
        tags: List[str],
        summary: str,
    ) -> float:
        """计算混合分数：向量相似度 × 0.7 + 关键词分数 × 0.3

        - 有向量且维度匹配：加权混合
        - 无向量或维度不匹配：降级为纯关键词分数

        返回 0 表示不进入结果集。
        """
        kw_score = keyword_score(query, title, tags, summary)

        # 向量相似度
        vec_score = 0.0
        has_vec = False
        if query_embedding is not None and doc_embedding:
            # 维度匹配才用向量（避免老 1536 维 hash 向量与新 512 维 query 误用）
            if len(query_embedding) == len(doc_embedding):
                sim = self._cosine_similarity(query_embedding, doc_embedding)
                # bge 归一化后余弦相似度在 [-1, 1]，截断到 [0, 1]
                vec_score = max(0.0, sim)
                has_vec = True

        if has_vec:
            # 混合分数
            hybrid = vec_score * self.VECTOR_WEIGHT + kw_score * self.KEYWORD_WEIGHT
            # 向量分数 ≥ 阈值 或 关键词匹配，才返回
            if vec_score >= self.MIN_VEC_THRESHOLD or kw_score > 0:
                return hybrid
            return 0.0
        else:
            # 无向量：纯关键词，kw_score=0 不返回
            return kw_score

    async def _get_all_cards(self) -> List[Card]:
        """获取所有卡片（含无 embedding 的，降级关键词搜索）"""
        query = select(Card)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def _get_all_tools(self) -> List[Tool]:
        """获取所有工具"""
        query = select(Tool)
        result = await self.db.execute(query)
        return result.scalars().all()

    @staticmethod
    def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
        """计算余弦相似度

        bge 归一化后的向量，余弦相似度 = 点积，但这里保留完整计算以兼容未归一化的向量。

        Args:
            v1: 向量 1
            v2: 向量 2

        Returns:
            相似度分数（-1 ~ 1）
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

        return dot_product / (magnitude_v1 * magnitude_v2)
