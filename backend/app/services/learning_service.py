"""
待学习队列服务层

核心流程：
1. 快速保存：仅 URL + 标题入库，< 500ms 返回给扩展
2. 后台 AI 补全：AI 模式下保存后自动触发 AI 生成（摘要/标签/关键观点）
   - is_ready=False → AI 生成中
   - is_ready=True + AI 内容 → AI 生成成功
   - is_ready=True + AI 内容为空 → AI 生成失败或基础模式
3. 按需 AI 生成：用户在 ConvertModal 中可重新触发 AI 生成（覆盖后台结果）
4. 转换：前端确认内容后，调用 convert_item 做纯数据搬迁（不触发 AI）
"""

from app.core.logging import get_logger
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models.models import LearningItem, Card, Tool
from app.db.schemas.schemas import (
    LearningItemCreate,
    LearningAiGenerateArticleResponse,
    LearningAiGenerateToolResponse,
)
from app.providers.base import BaseAIProvider
from app.services.tag_service import get_candidate_tags, normalize_tags

log = get_logger(__name__)


class LearningService:
    """待学习队列服务"""

    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider

    async def create_item(self, data: LearningItemCreate) -> LearningItem:
        """
        快速保存待学习项（轻量）。

        跨入口去重（60s 内同 URL 不重复创建）：覆盖浏览器 ⭐️、扩展 popup、Bookmarklet
        三条链路，避免「先点 popup 再点 ⭐️」产生两条看起来像丢失的重复记录。
        匹配命中条件：同一 source_url，is_converted=False，创建时间 < 60s；
        此时直接返回已存在条目。

        AI 模式：is_ready=False，后台自动触发 AI 补全，完成后标记 is_ready=True。
        基础模式：is_ready=True，无 AI 生成，用户手动填写。

        Returns:
            LearningItem
        """
        # --------- 跨入口 60s 同 URL 去重 ---------
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
            log.info(
                "create_item 命中 60s 同 URL 去重：source_url=%s 已存在 item #%s (type=%s)，直接返回",
                data.source_url,
                existing.id,
                existing.item_type,
            )
            # 如果新请求带了 item_type，比现有 "unspecified" 更明确 → 升级类型保留
            if existing.item_type == "unspecified" and data.item_type in (
                "article",
                "tool",
            ):
                existing.item_type = data.item_type
                await self.db.commit()
                await self.db.refresh(existing)
            return existing

        is_ai_mode = not self.ai_provider.is_demo
        item = LearningItem(
            source_url=data.source_url,
            title=data.title,
            item_type=data.item_type,
            content=data.content,
            is_ready=not is_ai_mode,  # AI 模式 False（生成中），基础模式 True
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)

        # AI 模式：后台触发 AI 补全（不阻塞响应）
        if is_ai_mode and data.content:
            asyncio.create_task(self._background_enrich(item.id))

        return item

    async def ai_generate(
        self, item_id: int, item_type: str
    ) -> LearningAiGenerateArticleResponse | LearningAiGenerateToolResponse:
        """按需 AI 生成（前端弹窗调用），返回生成结果但不落库。

        AI 模式：调用真实 AI，返回 Pydantic 校验后的结果。
        基础模式：直接返回空字段，前端展示空表单供用户手填。
        """
        item = await self._get_item(item_id)
        if not item:
            raise ValueError("待学习项不存在")

        content = item.content or ""
        if not content:
            raise ValueError("无正文可用于 AI 生成")

        # 基础模式：返回空字段，前端展示空表单
        if self.ai_provider.is_demo:
            if item_type == "article":
                return LearningAiGenerateArticleResponse()
            else:
                return LearningAiGenerateToolResponse()

        # AI 模式：真实生成
        tag_table = "cards" if item_type == "article" else "tools"
        candidates = await get_candidate_tags(self.db, tag_table, top_n=30)

        if item_type == "article":
            result = await self.ai_provider.generate_card(
                item.source_url, content, candidate_tags=candidates
            )
            return LearningAiGenerateArticleResponse(
                summary=result["summary"],
                key_points=result["key_points"],
                tags=normalize_tags(result["tags"], candidates),
            )
        else:
            result = await self.ai_provider.generate_tool(
                item.source_url, content, candidate_tags=candidates
            )
            return LearningAiGenerateToolResponse(
                description=result.get("description", ""),
                tags=normalize_tags(result["tags"], candidates),
            )

    async def _background_enrich(self, item_id: int) -> None:
        """后台 AI 补全（asyncio.create_task 调用，需独立 DB session）。

        成功：写入 ai_summary / key_points / ai_tags / tool_description，is_ready=True。
        失败：is_ready=True（防止永久卡在生成中），AI 字段保持空，前端显示"AI 生成失败"。
        """
        from app.core.database import async_session_maker
        from app.core.provider_manager import get_provider_manager

        try:
            # 通过 ProviderManager 获取当前配置的 AI Provider（含 embedding）
            # 确保与请求处理使用同一实例，避免 DemoAIProvider 问题
            ai_provider = get_provider_manager().get_provider()

            async with async_session_maker() as session:
                item = await session.execute(
                    select(LearningItem).where(LearningItem.id == item_id)
                )
                item_obj = item.scalar_one_or_none()
                if not item_obj or item_obj.is_converted:
                    return

                content = item_obj.content or ""
                if not content:
                    # 无正文，直接标记 ready（无法生成）
                    item_obj.is_ready = True
                    await session.commit()
                    return

                item_type = item_obj.item_type
                # unspecified 类型无法生成，等待用户选择类型后手动触发
                if item_type == "unspecified":
                    item_obj.is_ready = True
                    await session.commit()
                    return
                tag_table = "cards" if item_type == "article" else "tools"
                candidates = await get_candidate_tags(session, tag_table, top_n=30)

                if item_type == "article":
                    result = await ai_provider.generate_card(
                        item_obj.source_url, content, candidate_tags=candidates
                    )
                    item_obj.ai_summary = result.get("summary", "")
                    item_obj.key_points = result.get("key_points", [])
                    item_obj.ai_tags = normalize_tags(
                        result.get("tags", []), candidates
                    )
                else:
                    result = await ai_provider.generate_tool(
                        item_obj.source_url, content, candidate_tags=candidates
                    )
                    item_obj.tool_description = result.get("description", "")
                    item_obj.ai_tags = normalize_tags(
                        result.get("tags", []), candidates
                    )

                item_obj.is_ready = True
                await session.commit()
                log.info("后台 AI 补全完成：item #%s (type=%s)", item_id, item_type)

        except Exception as exc:
            log.warning("后台 AI 补全失败：item #%s，%s", item_id, exc)
            # 失败也标记 ready，防止永久卡在"生成中"
            try:
                async with async_session_maker() as session:
                    item = await session.execute(
                        select(LearningItem).where(LearningItem.id == item_id)
                    )
                    item_obj = item.scalar_one_or_none()
                    if item_obj and not item_obj.is_ready:
                        item_obj.is_ready = True
                        await session.commit()
            except Exception as inner_exc:
                log.error(
                    "后台 AI 补全失败后标记 ready 也失败：item #%s，%s",
                    item_id,
                    inner_exc,
                )

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
        items = result.scalars().all()

        # 兼容：is_ready=False 超过 10 分钟的条目视为"后台任务丢失"，
        # 自动修正为 True，避免永久卡在"生成中"（正常 AI 生成应在数十秒内完成）
        ten_min_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
            minutes=10
        )
        stale = [
            i
            for i in items
            if not i.is_ready and not i.is_converted and i.created_at < ten_min_ago
        ]
        if stale:
            from sqlalchemy import update as sa_update

            stale_ids = [i.id for i in stale]
            await self.db.execute(
                sa_update(LearningItem)
                .where(LearningItem.id.in_(stale_ids))
                .values(is_ready=True)
            )
            await self.db.commit()
            for i in stale:
                i.is_ready = True

        return items

    async def get_item(self, item_id: int) -> Optional[LearningItem]:
        return await self._get_item(item_id)

    async def convert_item(
        self,
        item_id: int,
        overwrite_data: Optional[dict] = None,
    ) -> Optional[LearningItem]:
        """
        将待学习项转换为卡片/工具（纯数据搬迁，不触发 AI）。

        前端已通过 ConvertModal 确认内容，此处直接写入 cards/tools 表。
        """
        item = await self._get_item(item_id)
        if not item:
            return None

        # 应用用户确认的数据（注意：ai_tags 字段名含 "ai_" 前缀，
        # 基础模式下实际为用户手填标签，但为保持 DB 列名一致性不做区分）
        if overwrite_data:
            for key, value in overwrite_data.items():
                if value is not None and hasattr(item, key):
                    setattr(item, key, value)

        if item.item_type not in ("article", "tool"):
            raise ValueError(
                f"转换前必须指定类型（article 或 tool），当前 item_type={item.item_type!r}"
            )

        # 生成 embedding（如果 AI 模式且有内容）
        embedding = None
        if not self.ai_provider.is_demo:
            try:
                if item.item_type == "article" and item.ai_summary:
                    embed_text = "\n".join(
                        [item.title, item.ai_summary, *(item.key_points or [])]
                    )
                    embedding = await self.ai_provider.safe_generate_embedding(
                        embed_text
                    )
                elif item.item_type == "tool" and item.tool_description:
                    embed_text = " ".join(
                        [item.title, item.tool_description, *(item.ai_tags or [])]
                    )
                    embedding = await self.ai_provider.safe_generate_embedding(
                        embed_text
                    )
            except Exception as exc:
                log.warning("embedding 生成失败（非阻塞）：%s", exc)

        # 写入目标表
        if item.item_type == "article":
            card = Card(
                source_url=item.source_url,
                title=item.title,
                ai_summary=item.ai_summary or "",
                key_points=item.key_points or [],
                ai_tags=item.ai_tags or [],
                source_type="article",
                embedding=embedding,
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
                embedding=embedding,
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

    async def update_item(
        self, item_id: int, update_data: dict
    ) -> Optional[LearningItem]:
        """编辑待学习项的 AI 生成内容（标题/摘要/关键观点/标签/工具描述）。

        仅更新传入的非 None 字段。编辑后的内容在 convert 时透传到 cards/tools 表。
        """
        item = await self._get_item(item_id)
        if not item:
            return None
        for key, value in update_data.items():
            if value is not None and hasattr(item, key):
                setattr(item, key, value)
        await self.db.commit()
        await self.db.refresh(item)
        return item
