"""
卡片服务层
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete, text
from typing import List, Optional
from datetime import datetime, timedelta
from urllib.parse import urlparse

from app.db.models.models import Card
from app.db.schemas.schemas import CardCreate, CardUpdate
from app.providers.base import BaseAIProvider
from app.tools.content_extractor import content_extractor, ExtractionResult


class CardService:
    """卡片服务"""

    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider

    async def create_card(self, url: str, content: Optional[str] = None) -> Card:
        """
        创建卡片（正文抽取 + AI 生成）

        Args:
            url: 原文 URL
            content: 可选，已预先提供的正文（如 Bookmarklet 直接传入浏览器 DOM 文本）。
                     为 None 时自动从 URL 抓取抽取。

        Returns:
            Card 模型实例

        Raises:
            ValueError: 正文抽取失败时抛出，由路由层转为 HTTP 422
        """
        # Step 1: 正文抽取（content 已传入则跳过抓取）
        if content is None:
            extraction = await content_extractor.extract(url)
            if not extraction.success:
                raise ValueError(extraction.error or "正文抽取失败")
            extracted_title = extraction.title
            content_text = extraction.content
            source_type = extraction.content_type
        else:
            extracted_title = None
            content_text = content
            source_type = "article"

        # Step 2: AI 生成卡片内容（标题 / 摘要 / 关键观点 / 标签 / 向量）
        card_data = await self.ai_provider.generate_card(url, content_text)

        # Step 3: 标题优先级：AI 生成 > 抽取 > URL 兜底
        title = card_data.get("title") or extracted_title or self._fallback_title(url)

        # Step 4: 创建数据库记录
        new_card = Card(
            source_url=url,
            title=title,
            ai_summary=card_data["summary"],
            key_points=card_data["key_points"],
            ai_tags=card_data["tags"],
            source_type=source_type,
            embedding=card_data["embedding"],
            read_at=datetime.now(),
        )

        self.db.add(new_card)
        await self.db.commit()
        await self.db.refresh(new_card)

        return new_card

    async def generate_card_preview(self, url: str) -> dict:
        """
        仅预览 AI 生成结果，不写库。

        Returns:
            {"summary", "key_points", "tags"} 或在抽取失败时抛 ValueError
        """
        extraction = await content_extractor.extract(url)
        if not extraction.success:
            raise ValueError(extraction.error or "正文抽取失败")
        result = await self.ai_provider.generate_card(url, extraction.content)
        return {
            "summary": result["summary"],
            "key_points": result["key_points"],
            "tags": result["tags"],
        }

    @staticmethod
    def _fallback_title(url: str) -> str:
        """抽取不到标题时的兜底：用 hostname 做标题"""
        try:
            host = urlparse(url).netloc or url
            return f"来自 {host} 的卡片"
        except Exception:
            return f"来自 {url[:50]} 的卡片"

    async def get_cards(
        self,
        skip: int = 0,
        limit: int = 20,
        tag: Optional[str] = None,
        days: Optional[int] = None,
    ) -> List[Card]:
        """
        获取卡片列表

        Args:
            skip: 跳过数量
            limit: 返回数量
            tag: 标签筛选
            days: 天数筛选（如 7 表示最近 7 天）

        Returns:
            卡片列表
        """
        query = select(Card).order_by(Card.created_at.desc())

        if tag:
            # SQLite 存储中文标签时 JSON 序列化默认 ensure_ascii=True，
            # 中文被转义成 \uXXXX，LIKE 字符串匹配会失效。
            # 改用 json_each 表值函数解析 JSON 数组元素、按值精确匹配，
            # 不受存储编码影响。迁移 PostgreSQL 时改用 @> 操作符即可。
            query = query.where(
                text(
                    "EXISTS (SELECT 1 FROM json_each(cards.ai_tags) WHERE value = :tag)"
                ).bindparams(tag=tag)
            )

        if days:
            cutoff_date = datetime.now() - timedelta(days=days)
            query = query.where(Card.created_at >= cutoff_date)

        query = query.offset(skip).limit(limit)

        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_tags_with_count(self) -> List[dict]:
        """
        返回所有去重标签及其关联卡片数。

        用 json_each 将每张卡片的 ai_tags 数组展开成多行，
        再按标签值聚合计数。不受 JSON 存储编码（ensure_ascii）影响。

        Returns:
            [{"name": str, "count": int}, ...]，按 count 降序、name 升序
        """
        sql = text(
            """
            SELECT je.value AS name, COUNT(*) AS count
            FROM cards c, json_each(c.ai_tags) AS je
            WHERE je.value IS NOT NULL
            GROUP BY je.value
            ORDER BY count DESC, name ASC
            """
        )
        result = await self.db.execute(sql)
        rows = result.fetchall()
        return [{"name": row[0], "count": row[1]} for row in rows]

    async def get_card(self, card_id: int) -> Optional[Card]:
        """获取单个卡片"""
        query = select(Card).where(Card.id == card_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_card(
        self, card_id: int, update_data: CardUpdate
    ) -> Optional[Card]:
        """更新卡片"""
        card = await self.get_card(card_id)
        if not card:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            if hasattr(card, key):
                setattr(card, key, value)

        card.updated_at = datetime.now()
        await self.db.commit()
        await self.db.refresh(card)

        return card

    async def delete_card(self, card_id: int) -> bool:
        """删除卡片"""
        card = await self.get_card(card_id)
        if not card:
            return False

        await self.db.delete(card)
        await self.db.commit()

        return True
