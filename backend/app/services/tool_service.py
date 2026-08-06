"""
工具箱服务层
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.db.models.models import Tool
from app.db.schemas.schemas import ToolCreate, ToolUpdate
from app.providers.base import BaseAIProvider


class ToolService:
    """工具箱服务"""
    
    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider
    
    async def create_tool(self, url: str, title: str, description: Optional[str] = None) -> Tool:
        """
        收藏工具（AI 自动打标签）
        
        Args:
            url: 工具 URL
            title: 工具标题
            description: 描述
            
        Returns:
            Tool 模型实例
        """
        # AI 自动分类和打标签
        classify_result = await self.ai_provider.classify_tool(url, title, "")
        
        # 创建数据库记录
        new_tool = Tool(
            url=url,
            title=title,
            ai_tags=classify_result["tags"],
            description=description,
        )
        
        self.db.add(new_tool)
        await self.db.commit()
        await self.db.refresh(new_tool)
        
        return new_tool
    
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
            工具列表
        """
        query = select(Tool)
        
        # 标签筛选
        if tag:
            query = query.where(Tool.ai_tags.contains([tag]))
        
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
    
    async def get_tool(self, tool_id: int) -> Optional[Tool]:
        """获取单个工具"""
        query = select(Tool).where(Tool.id == tool_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def update_tool(self, tool_id: int, update_data: ToolUpdate) -> Optional[Tool]:
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