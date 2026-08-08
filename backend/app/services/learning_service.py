"""
待学习队列服务层

核心流程：
1. 快速保存：仅 URL + 标题入库，< 500ms 返回给扩展
2. 后台异步补全：通过 asyncio.create_task 触发 AI 生成摘要/标签
3. Web 应用查看：is_ready=True 时展示完整内容，否则展示"AI 生成中"
4. 转换：用户在 Web 应用确认后转为卡片/工具
"""

import logging
from datetime import datetime, timedelta, timezone
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

        跨入口去重（60s 内同 URL 不重复创建）：覆盖浏览器 ⭐️、扩展 popup、Bookmarklet
        三条链路，避免「先点 popup 再点 ⭐️」产生两条看起来像丢失的重复记录。
        匹配命中条件：同一 source_url，is_converted=False，创建时间 < 60s；
        此时直接返回已存在条目（允许 item_type 不同，优先返回未转化项，避免
        用户在待分类 tab 找不到自己刚 ⭐️ 的 URL 以为丢了）。

        当 item_type == "unspecified" 时（一键入口：书签/bookmarklet），因未知用户意图，
        跳过后台 AI 补全，**不**提前生成错误类型的内容；等用户在暂存区选择类型后，
        convert_item 会同步生成正确类型的内容。

        Returns:
            LearningItem（is_ready=False，AI 内容尚未补全）
        """
        # --------- 跨入口 60s 同 URL 去重 ---------
        # 注意：DB created_at 用 server_default=func.now()（SQLite CURRENT_TIMESTAMP），是 UTC 时间。
        # 这里必须同样用 UTC，否则 Asia/Shanghai (UTC+8) 会差 8 小时导致 WHERE 永远不命中。
        sixty_sec_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
            seconds=60
        )
        result = await self.db.execute(
            select(LearningItem).where(
                LearningItem.source_url == data.source_url,
                LearningItem.is_converted == False,  # 未转化的仍在暂存区
                LearningItem.created_at >= sixty_sec_ago,
            )
        )
        existing: Optional[LearningItem] = result.scalars().first()
        if existing:
            logger.info(
                "create_item 命中 60s 同 URL 去重：source_url=%s 已存在 item #%s (type=%s)，直接返回",
                data.source_url,
                existing.id,
                existing.item_type,
            )
            # 如果新请求带了 item_type，比现有 "unspecified" 更明确 → 升级类型保留（给用户明确感）
            if existing.item_type == "unspecified" and data.item_type in (
                "article",
                "tool",
            ):
                existing.item_type = data.item_type
                # 升级后若还没启动 AI 补全，启动一次
                if data.content and not existing.is_ready:
                    asyncio.create_task(
                        self._ai_enrich(existing.id, data.content, data.item_type)
                    )
                await self.db.commit()
                await self.db.refresh(existing)
            return existing

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
        if content_text and data.item_type != "unspecified":
            # 用 create_task 异步执行，不等待结果
            asyncio.create_task(self._ai_enrich(item.id, content_text, data.item_type))
        elif data.item_type == "unspecified":
            logger.info(
                "待学习项 %d item_type=unspecified，跳过后台 AI 补全（等用户在暂存区选择类型后再生成）",
                item.id,
            )
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

        1. 先应用用户覆盖（例如从未指定类型的条目 → 指定为 article/tool）。
        2. 按最终类型检查 AI 内容是否齐全：
           - article：需要 ai_summary + is_ready
           - tool：需要 tool_description + is_ready
           缺失则同步补全，使用最终类型对应的 AI 模板。
        3. 按最终类型写入 cards 或 tools 表。

        转换后 is_converted=True，记录 converted_id。
        """
        item = await self._get_item(item_id)
        if not item:
            return None

        # （1）先应用用户覆盖数据（包含 item_type/标题/标签等）
        if overwrite_data:
            for key, value in overwrite_data.items():
                if value is not None and hasattr(item, key):
                    setattr(item, key, value)

        # 最终类型必须是 article 或 tool
        if item.item_type not in ("article", "tool"):
            raise ValueError(
                f"转换前必须指定类型（article 或 tool），当前 item_type={item.item_type!r}"
            )

        # （2）按最终类型判断 AI 内容是否就绪；缺失则同步补全
        needs_enrich = False
        if not item.is_ready:
            needs_enrich = True
        elif item.item_type == "article" and not item.ai_summary:
            needs_enrich = True
        elif item.item_type == "tool" and not item.tool_description:
            needs_enrich = True

        if needs_enrich:
            stored_content = item.content or ""
            if not stored_content:
                raise ValueError(
                    "AI 内容尚未生成，且无存储正文可用于补全。请稍后再试或手动重新生成。"
                )
            logger.info(
                "待学习项 %d 按类型 %s 同步补全 AI 内容...",
                item_id,
                item.item_type,
            )
            # 先提交当前会话的 overwrite 修改（结束事务）。
            # 否则 _ai_enrich 用独立 bg_db 会话 commit 的 AI 内容对 self.db
            # 当前事务不可见（SQLite 快照隔离），导致后续 _get_item 读到的
            # ai_summary 仍为旧值 → 写入 cards 时为空字符串。
            await self.db.commit()
            await self._ai_enrich(item.id, stored_content, item.item_type)
            # _ai_enrich 在独立 bg_db 会话中已 commit；但 self.db 的 identity map
            # 缓存了旧 item 对象（expire_on_commit=False 不会自动失效），SELECT 会
            # 返回缓存对象而不刷新属性。必须 expire_all 强制下次查询从 DB 重新加载。
            self.db.expire_all()
            item = await self._get_item(item_id)
            if not item:
                return None
            # 校验 AI 补全确实成功（_ai_enrich 内部 try/except 会吞掉 AI 异常，
            # 这里兜底防止空内容落库到 cards/tools）
            if item.item_type == "article" and not item.ai_summary:
                raise ValueError(
                    "AI 摘要生成失败，请稍后重试或在卡片中手动填写摘要。"
                )
            if item.item_type == "tool" and not item.tool_description:
                raise ValueError(
                    "AI 工具描述生成失败，请稍后重试或手动填写描述。"
                )

        # （3）转换为卡片或工具（按最终类型分支）
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
