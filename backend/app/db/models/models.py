"""
数据模型定义
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, JSON, Text
from sqlalchemy.sql import func
from app.core.database import Base


class Card(Base):
    """知识卡片模型"""

    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    source_url = Column(String(2048), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    ai_summary = Column(String(2000), nullable=False)
    key_points = Column(JSON, default=list)  # List[str]
    ai_tags = Column(JSON, default=list)  # List[str]
    source_type = Column(String(50), default="article")  # article | video | document
    embedding = Column(JSON, default=list)  # List[float] - 向量
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Tool(Base):
    """工具箱模型"""

    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    ai_tags = Column(JSON, default=list)  # List[str]
    description = Column(String(1000), nullable=True)
    embedding = Column(JSON, default=list)  # List[float] - 向量（语义检索用）
    visit_count = Column(Integer, default=0)
    last_visited_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Tag(Base):
    """标签模型"""

    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    color = Column(String(20), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class LearningItem(Base):
    """待学习队列模型

    用户快速收藏时先写入轻量记录（仅 URL + 标题），AI 内容后台异步补全。
    补全完成后 is_ready=True，可在 Web 应用查看完整卡片预览。
    最终用户确认"已读并生成卡片"后，由卡片库/工具箱承接，
    learning_queue 记录保留作为流转历史。
    """

    __tablename__ = "learning_queue"

    id = Column(Integer, primary_key=True, index=True)
    source_url = Column(String(2048), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    item_type = Column(String(20), nullable=False, default="article")  # article | tool
    # 原始正文：扩展端提取后传入，用于后台 AI 补全和失败重试
    content = Column(Text, nullable=True)
    ai_summary = Column(String(2000), nullable=True)
    key_points = Column(JSON, default=list)
    ai_tags = Column(JSON, default=list)
    tool_description = Column(String(1000), nullable=True)
    is_ready = Column(Boolean, default=False)  # AI 内容是否已补全
    is_converted = Column(Boolean, default=False)  # 是否已转为卡片/工具
    converted_id = Column(Integer, nullable=True)  # 转换后的卡片/工具 ID
    embedding = Column(JSON, default=list)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
