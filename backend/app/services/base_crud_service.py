"""
基础 CRUD 服务抽象层

为 CardService / ToolService 提供通用的：
  - get_by_id    获取单条
  - update       按 Pydantic schema 更新
  - delete       软/硬删除（目前为硬删除）
  - get_tags_with_count   按 ai_tags JSON 数组聚合标签计数

子类通过 ModelType / UpdateSchema 泛型 + 表名注入来复用这些方法。
"""

from typing import Generic, List, Optional, Type, TypeVar

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import Base
from app.providers.base import BaseAIProvider

ModelType = TypeVar("ModelType", bound=Base)
UpdateSchema = TypeVar("UpdateSchema", bound=BaseModel)


class BaseCRUDService(Generic[ModelType, UpdateSchema]):
    """
    卡片/工具服务的通用 CRUD 基类。

    约定：
      - 模型主键字段名：id (int)
      - 标签数组列名：ai_tags (JSON list[str])
      - updated_at 字段存在且可自动更新（由子类 / 模型决定；本类统一填充）
    """

    # 子类必须覆盖
    model: Type[ModelType]
    # 对应 SQL 表名（用于 json_each 原生 SQL 时定位正确的表）
    table_name: str
    # 若模型无 updated_at 字段，子类可显式设为 False
    has_updated_at: bool = True

    def __init__(self, db: AsyncSession, ai_provider: BaseAIProvider):
        self.db = db
        self.ai_provider = ai_provider

    # ------------------------------------------------------------------ CRUD

    async def get_by_id(self, item_id: int) -> Optional[ModelType]:
        """通用：按主键获取单条"""
        query = select(self.model).where(self.model.id == item_id)  # type: ignore[attr-defined]
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update(
        self, item_id: int, update_data: UpdateSchema
    ) -> Optional[ModelType]:
        """通用：按 Pydantic schema 的 exclude_unset 字段增量更新"""
        item = await self.get_by_id(item_id)
        if item is None:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            if hasattr(item, key):
                setattr(item, key, value)

        if self.has_updated_at and hasattr(item, "updated_at"):
            from datetime import datetime

            item.updated_at = datetime.now()

        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete(self, item_id: int) -> bool:
        """通用：按主键硬删除，删除成功返回 True"""
        item = await self.get_by_id(item_id)
        if item is None:
            return False

        await self.db.delete(item)
        await self.db.commit()
        return True

    # ---------------------------------------------------------------- Tags

    async def get_tags_with_count(self) -> List[dict]:
        """
        通用：聚合 ai_tags JSON 数组，返回去重标签及计数。

        使用 json_each 表值函数展开 JSON 数组元素后按值聚合计数，
        不受 SQLite ensure_ascii 转义影响。迁移 PostgreSQL 时只需改
        此处为 `ai_tags @> jsonb_build_array(:tag)` 即可。

        Returns:
            [{"name": str, "count": int}, ...]，按 count 降序、name 升序
        """
        # 注意：表名来自类常量，不接受用户输入，所以可安全字符串拼接
        sql = text(
            f"""
            SELECT je.value AS name, COUNT(*) AS count
            FROM {self.table_name} t, json_each(t.ai_tags) AS je
            WHERE je.value IS NOT NULL
            GROUP BY je.value
            ORDER BY count DESC, name ASC
            """
        )
        result = await self.db.execute(sql)
        rows = result.fetchall()
        return [{"name": row[0], "count": row[1]} for row in rows]
