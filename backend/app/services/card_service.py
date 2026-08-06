"""
卡片服务层
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete
from typing import List, Optional
from datetime import datetime, timedelta

from app.db.models.models import Card
from app.db.schemas.schemas import CardCreate, CardUpdate
from app.providers.base import BaseAIProvider


class CardService:
    """卡片服务"""
    
    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider
    
    async def create_card(self, url: str, content: str) -> Card:
        """
        创建卡片（AI 生成）
        
        Args:
            url: 原文 URL
            content: 正文内容
            
        Returns:
            Card 模型实例
        """
        # AI 生成卡片内容
        card_data = await self.ai_provider.generate_card(url, content)
        
        # 创建数据库记录
        new_card = Card(
            source_url=url,
            title=f"Card from {url[:50]}...",  # TODO: 从 content 提取标题
            ai_summary=card_data["summary"],
            key_points=card_data["key_points"],
            ai_tags=card_data["tags"],
            source_type="article",
            embedding=card_data["embedding"],
            read_at=datetime.now(),
        )
        
        self.db.add(new_card)
        await self.db.commit()
        await self.db.refresh(new_card)
        
        return new_card
    
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
            query = query.where(Card.ai_tags.contains([tag]))
        
        if days:
            cutoff_date = datetime.now() - timedelta(days=days)
            query = query.where(Card.created_at >= cutoff_date)
        
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_card(self, card_id: int) -> Optional[Card]:
        """获取单个卡片"""
        query = select(Card).where(Card.id == card_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def update_card(self, card_id: int, update_data: CardUpdate) -> Optional[Card]:
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