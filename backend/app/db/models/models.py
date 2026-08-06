"""
数据模型定义
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, JSON
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
    ai_tags = Column(JSON, default=list)     # List[str]
    source_type = Column(String(50), default="article")  # article | video | document
    embedding = Column(JSON, default=list)   # List[float] - 向量
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Tool(Base):
    """工具箱模型"""
    __tablename__ = "tools"
    
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    ai_tags = Column(JSON, default=list)     # List[str]
    description = Column(String(1000), nullable=True)
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