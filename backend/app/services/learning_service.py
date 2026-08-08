"""
待学习队列服务层

核心流程：
1. 快速保存：仅 URL + 标题入库，< 500ms 返回给扩展
2. 后台异步补全：通过 asyncio.create_task 触发 AI 生成摘要/标签
3. Web 应用查看：is_ready=True 时展示完整内容，否则展示"AI 生成中"
4. 转换：用户在 Web 应用确认后转为卡片/工具
"""

import logging
from datetime import datetime
from typing import List, Optional

import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select, update

from app.db.models.models import LearningItem, Card, Tool
from app.db.schemas.schemas import LearningItemCreate
from app.providers.base import BaseAIProvider
from app.core.database import engine
from app.services.tag_service import get_candidate_tags, normalize_tags
from app.services.card_service import CardService
from app.services.tool_service import ToolService

logger = logging.getLogger(__name__)


class LearningService:
    """待学习队列服务"""

    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider

    async def create_item(self, data: LearningItemCreate) -> LearningItem:
        """
        快速保存待学习项（轻量），然后后台异步触发 AI 补全。

        Returns:
            LearningItem（is_ready=False，AI 内容尚未补全）
        """
        item = LearningItem(
            source_url=data.source_url,
            title=data.title,
            item_type=data.item_type,
            content=data.content,
            is_ready=False,
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)

        # 后台异步 AI 补全（不阻塞响应）
        content_text = data.content or ""
        if content_text:
            # 用 create_task 异步执行，不等待结果
            asyncio.create_task(self._ai_enrich(item.id, content_text, data.item_type))
        else:
            logger.info(
                "待学习项 %d 无正文，跳过 AI 补全（将在用户打开 Web 应用时触发）",
                item.id,
            )

        return item

    async def _ai_enrich(self, item_id: int, content: str, item_type: str) -> None:
        """后台 AI 补全：为待学习项生成摘要/标签/描述。

        使用独立数据库会话，不依赖请求生命周期。
        """
        # 创建独立会话用于后台任务
        session_maker = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        async with session_maker() as bg_db:
            try:
                result = await self._do_ai_enrich(bg_db, item_id, content, item_type)
                if result:
                    await bg_db.commit()
                    logger.info("待学习项 %d AI 补全完成", item_id)
            except Exception as exc:
                logger.error("待学习项 %d AI 补全失败：%s", item_id, exc)

    async def _do_ai_enrich(
        self, db: AsyncSession, item_id: int, content: str, item_type: str
    ) -> Optional[LearningItem]:
        """实际执行 AI 补全的内部方法"""
        from sqlalchemy import select as sa_select

        result = await db.execute(
            sa_select(LearningItem).where(LearningItem.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            return None

        # 候选标签从对应内容池聚合：article 沉淀为 cards，tool 沉淀为 tools
        # （不能直接 item_type + "s"，否则 article 会得到 "articles" 这个不存在的表名）
        tag_table = "cards" if item_type == "article" else "tools"
        candidates = await get_candidate_tags(db, tag_table, top_n=30)

        if item_type == "article":
            ai_result = await self.ai_provider.generate_card(
                item.source_url, content, candidate_tags=candidates
            )
            normalized_tags = normalize_tags(ai_result["tags"], candidates)
            embed_text = "\n".join(
                [item.title, ai_result["summary"], *ai_result["key_points"]]
            )
            embedding = await self.ai_provider.safe_generate_embedding(embed_text)

            stmt = (
                update(LearningItem)
                .where(LearningItem.id == item_id)
                .values(
                    ai_summary=ai_result["summary"],
                    key_points=ai_result["key_points"],
                    ai_tags=normalized_tags,
                    embedding=embedding,
                    is_ready=True,
                    updated_at=datetime.now(),
                )
            )
        else:
            ai_result = await self.ai_provider.generate_tool(
                item.source_url, content, candidate_tags=candidates
            )
            normalized_tags = normalize_tags(ai_result["tags"], candidates)
            embed_text = " ".join(
                [item.title, ai_result.get("description", ""), *normalized_tags]
            )
            embedding = await self.ai_provider.safe_generate_embedding(embed_text)

            stmt = (
                update(LearningItem)
                .where(LearningItem.id == item_id)
                .values(
                    tool_description=ai_result.get("description", ""),
                    ai_tags=normalized_tags,
                    embedding=embedding,
                    is_ready=True,
                    updated_at=datetime.now(),
                )
            )

        await db.execute(stmt)
        await db.commit()
        await db.refresh(item)
        return item

    async def _get_item(self, item_id: int) -> Optional[LearningItem]:
        result = await self.db.execute(
            select(LearningItem).where(LearningItem.id == item_id)
        )
        return result.scalar_one_or_none()

    async def list_items(
        self,
        skip: int = 0,
        limit: int = 50,
        include_converted: bool = False,
    ) -> List[LearningItem]:
        """获取待学习项列表"""
        query = select(LearningItem)
        if not include_converted:
            query = query.where(LearningItem.is_converted == False)
        query = query.order_by(LearningItem.created_at.desc())
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_item(self, item_id: int) -> Optional[LearningItem]:
        return await self._get_item(item_id)

    async def convert_item(
        self,
        item_id: int,
        overwrite_data: Optional[dict] = None,
    ) -> Optional[LearningItem]:
        """
        将待学习项转换为卡片或工具。

        如果 is_ready=False，会先触发一次 AI 补全（同步等待）。
        转换后 is_converted=True，记录 converted_id。
        """
        item = await self._get_item(item_id)
        if not item:
            return None

        # 若 AI 内容未就绪，先同步补全（用存储的 content）
        if not item.is_ready and item.ai_summary is None:
            logger.info("待学习项 %d AI 内容未就绪，同步补全中...", item_id)
            stored_content = item.content or ""
            if not stored_content:
                raise ValueError(
                    "AI 内容尚未生成，且无存储正文可用于补全。请稍后再试或手动重新生成。"
                )
            await self._ai_enrich(item.id, stored_content, item.item_type)
            item = await self._get_item(item_id)
            if not item:
                return None

        # 应用用户覆盖数据
        if overwrite_data:
            for key, value in overwrite_data.items():
                if value is not None and hasattr(item, key):
                    setattr(item, key, value)

        # 转换为卡片或工具
        if item.item_type == "article":
            card = Card(
                source_url=item.source_url,
                title=item.title,
                ai_summary=item.ai_summary or "",
                key_points=item.key_points or [],
                ai_tags=item.ai_tags or [],
                source_type="article",
                embedding=item.embedding or [],
                read_at=datetime.now(),
            )
            self.db.add(card)
            await self.db.commit()
            await self.db.refresh(card)
            item.is_converted = True
            item.converted_id = card.id
        else:
            tool = Tool(
                url=item.source_url,
                title=item.title,
                ai_tags=item.ai_tags or [],
                description=item.tool_description,
                embedding=item.embedding or [],
            )
            self.db.add(tool)
            await self.db.commit()
            await self.db.refresh(tool)
            item.is_converted = True
            item.converted_id = tool.id

        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete_item(self, item_id: int) -> bool:
        item = await self._get_item(item_id)
        if not item:
            return False
        await self.db.delete(item)
        await self.db.commit()
        return True

    async def trigger_enrich(
        self, item_id: int, content: str = ""
    ) -> Optional[LearningItem]:
        """手动触发 AI 补全（用户在 Web 应用点击"重新生成"时调用）"""
        item = await self._get_item(item_id)
        if not item:
            return None
        # 优先用传入的 content，其次用存储的 content
        actual_content = content or item.content or ""
        if not actual_content:
            raise ValueError("无正文可用于 AI 补全")
        await self._ai_enrich(item_id, actual_content, item.item_type)
        return await self._get_item(item_id)
