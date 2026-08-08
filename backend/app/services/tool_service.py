"""
工具箱服务层
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import List, Optional

from app.db.models.models import Tool
from app.db.schemas.schemas import ToolCreate, ToolUpdate
from app.providers.base import BaseAIProvider
from app.services.tag_service import get_candidate_tags, normalize_tags
from app.tools.content_extractor import content_extractor

logger = logging.getLogger(__name__)


class ToolService:
    """工具箱服务"""

    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider

    async def create_tool(
        self,
        url: str,
        title: str,
        description: Optional[str] = None,
        ai_tags: Optional[List[str]] = None,
        content: Optional[str] = None,
    ) -> Tool:
        """
        收藏工具（抓取页面正文 + AI 判断实际作用并打标签）

        Args:
            url: 工具 URL
            title: 工具标题
            description: 描述
            ai_tags: 预生成的标签（来自 generate 预览）。传入则跳过 AI 分类直接复用，
                     避免预览与最终保存结果不一致；为 None 时走 AI 分类流程。
            content: 可选，扩展端预提取的正文。传入则跳过 content_extractor，
                     规避反爬 / 重定向循环。

        Returns:
            Tool 模型实例
        """
        # Step 1: 抓取页面正文，让 AI 基于实际内容判断工具作用
        # 工具箱是终点站，抓取失败不阻断收藏，降级为 url+title 打标签
        # 扩展端预提取正文优先，避免后端抓取遇到反爬/重定向循环
        content_text = ""
        if content:
            content_text = content
            logger.info("工具收藏使用扩展端预提取正文（%d 字符）", len(content_text))
        else:
            try:
                extraction = await content_extractor.extract(url)
                if extraction.success:
                    content_text = extraction.content
                else:
                    logger.warning(
                        "工具页面抓取失败，降级为 url+title 打标签: %s",
                        extraction.error,
                    )
            except Exception as exc:  # noqa: BLE001 - 抓取兜底
                logger.warning("工具页面抓取异常，降级为 url+title 打标签: %s", exc)

        # Step 2: 标签来源——预生成标签（来自 generate 预览）优先；否则 AI 分类打标签
        candidates = await get_candidate_tags(self.db, "tools", top_n=30)
        if ai_tags is not None:
            # 预览阶段已归一化，直接复用，避免重复 AI 调用并保证预览与保存一致
            normalized_tags = ai_tags
        else:
            classify_result = await self.ai_provider.classify_tool(
                url, title, content_text, candidate_tags=candidates
            )
            # Step 2.5: 标签归一化（相似度去重，归并到已有标签，抑制同义标签膨胀）
            normalized_tags = normalize_tags(classify_result["tags"], candidates)

        # Step 2.6: 生成 embedding（用于语义检索；失败降级为 hash 向量，不阻断收藏）
        embed_text = " ".join([title, *normalized_tags, description or ""])
        embedding = await self.ai_provider.safe_generate_embedding(embed_text)

        # Step 3: 创建数据库记录
        new_tool = Tool(
            url=url,
            title=title,
            ai_tags=normalized_tags,
            description=description,
            embedding=embedding,
        )

        self.db.add(new_tool)
        await self.db.commit()
        await self.db.refresh(new_tool)

        return new_tool

    async def generate_tool_preview(
        self, url: str, content: Optional[str] = None
    ) -> dict:
        """
        仅预览 AI 生成的工具信息（标题 + 描述 + 标签），不写库。

        抓取失败时降级为空正文交给 AI，不抛异常（工具箱是终点站，宽容处理）。
        扩展端可传入预提取正文，跳过后端 content_extractor。

        Returns:
            {"title", "description", "tags"}
        """
        content_text = ""
        if content:
            content_text = content
            logger.info("工具预览使用扩展端预提取正文（%d 字符）", len(content_text))
        else:
            try:
                extraction = await content_extractor.extract(url)
                if extraction.success:
                    content_text = extraction.content
                else:
                    logger.warning(
                        "工具页面抓取失败，降级为空正文交 AI: %s", extraction.error
                    )
            except Exception as exc:  # noqa: BLE001 - 抓取兜底
                logger.warning("工具页面抓取异常，降级为空正文交 AI: %s", exc)

        candidates = await get_candidate_tags(self.db, "tools", top_n=30)
        result = await self.ai_provider.generate_tool(
            url, content_text, candidate_tags=candidates
        )
        return {
            "title": result["title"],
            "description": result["description"],
            "tags": normalize_tags(result["tags"], candidates),
        }

    async def get_tools(
        self,
        skip: int = 0,
        limit: int = 20,
        tag: Optional[str] = None,
        sort_by: str = "created_at",  # created_at | visit_count | last_visited_at
    ) -> List[Tool]:
        """
        获取工具列表

        Args:
            skip: 跳过数量
            limit: 返回数量
            tag: 标签筛选
            sort_by: 排序方式

        Returns:
            工具列表（关键词搜索请走 SearchService.semantic_search）
        """
        query = select(Tool)

        # 标签筛选
        if tag:
            # SQLite 存储中文标签时 JSON 序列化默认 ensure_ascii=True，
            # 中文被转义成 \uXXXX，LIKE 字符串匹配会失效。
            # 改用 json_each 表值函数解析 JSON 数组元素、按值精确匹配，
            # 不受存储编码影响。迁移 PostgreSQL 时改用 @> 操作符即可。
            query = query.where(
                text(
                    "EXISTS (SELECT 1 FROM json_each(tools.ai_tags) WHERE value = :tag)"
                ).bindparams(tag=tag)
            )

        # 排序
        if sort_by == "visit_count":
            query = query.order_by(Tool.visit_count.desc())
        elif sort_by == "last_visited_at":
            query = query.order_by(Tool.last_visited_at.desc())
        else:
            query = query.order_by(Tool.created_at.desc())

        query = query.offset(skip).limit(limit)

        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_tags_with_count(self) -> List[dict]:
        """
        返回所有去重标签及其关联工具数。

        用 json_each 将每个工具的 ai_tags 数组展开成多行，
        再按标签值聚合计数。不受 JSON 存储编码（ensure_ascii）影响。

        Returns:
            [{"name": str, "count": int}, ...]，按 count 降序、name 升序
        """
        sql = text(
            """
            SELECT je.value AS name, COUNT(*) AS count
            FROM tools t, json_each(t.ai_tags) AS je
            WHERE je.value IS NOT NULL
            GROUP BY je.value
            ORDER BY count DESC, name ASC
            """
        )
        result = await self.db.execute(sql)
        rows = result.fetchall()
        return [{"name": row[0], "count": row[1]} for row in rows]

    async def get_tool(self, tool_id: int) -> Optional[Tool]:
        """获取单个工具"""
        query = select(Tool).where(Tool.id == tool_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_tool(
        self, tool_id: int, update_data: ToolUpdate
    ) -> Optional[Tool]:
        """更新工具"""
        tool = await self.get_tool(tool_id)
        if not tool:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            if hasattr(tool, key):
                setattr(tool, key, value)

        await self.db.commit()
        await self.db.refresh(tool)

        return tool

    async def delete_tool(self, tool_id: int) -> bool:
        """删除工具"""
        tool = await self.get_tool(tool_id)
        if not tool:
            return False

        await self.db.delete(tool)
        await self.db.commit()

        return True

    async def increment_visit(self, tool_id: int) -> Optional[Tool]:
        """增加访问次数"""
        from datetime import datetime

        tool = await self.get_tool(tool_id)
        if not tool:
            return None

        tool.visit_count += 1
        tool.last_visited_at = datetime.now()

        await self.db.commit()
        await self.db.refresh(tool)

        return tool
