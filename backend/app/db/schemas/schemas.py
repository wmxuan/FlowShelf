"""
数据校验 Schema（Pydantic）
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ============ 卡片相关 ============


class CardBase(BaseModel):
    """卡片基础信息"""

    source_url: str = Field(..., description="原文 URL")
    title: str = Field(..., description="卡片标题")
    ai_summary: str = Field(..., description="AI 生成的摘要", max_length=500)
    key_points: List[str] = Field(default_factory=list, description="关键观点列表")
    ai_tags: List[str] = Field(default_factory=list, description="AI 生成的标签")
    source_type: str = Field(default="article", description="来源类型")


class CardCreate(BaseModel):
    """创建卡片请求

    传 source_url 单字段时走「正文抽取 + AI 生成」完整链路；
    附带 title/ai_summary/key_points/ai_tags 时走「预览保存」路径，
    跳过 AI 生成，保留用户在预览阶段编辑后的内容。
    """

    source_url: str = Field(..., description="原文 URL")
    title: Optional[str] = Field(
        default=None, description="预览阶段已生成的标题（用户可编辑）"
    )
    ai_summary: Optional[str] = Field(
        default=None, description="预览阶段已生成的摘要（用户可编辑）"
    )
    key_points: Optional[List[str]] = Field(
        default=None, description="预览阶段已生成的关键观点（用户可编辑）"
    )
    ai_tags: Optional[List[str]] = Field(
        default=None, description="预览阶段已生成的标签（用户可编辑）"
    )
    content: Optional[str] = Field(
        default=None,
        description="扩展端预先提取的页面正文（document.body.innerText）。"
        "传入则跳过后端 content_extractor，规避反爬/重定向循环。",
    )


class CardResponse(CardBase):
    """卡片响应"""

    id: int
    embedding: Optional[List[float]] = None
    read_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CardUpdate(BaseModel):
    """更新卡片请求"""

    title: Optional[str] = None
    ai_summary: Optional[str] = None
    key_points: Optional[List[str]] = None
    ai_tags: Optional[List[str]] = None
    read_at: Optional[datetime] = None


class TagCount(BaseModel):
    """标签及其关联卡片计数"""

    name: str
    count: int


# ============ 工具箱相关 ============


class ToolBase(BaseModel):
    """工具基础信息"""

    url: str = Field(..., description="工具 URL")
    title: str = Field(..., description="工具标题")


class ToolCreate(ToolBase):
    """创建工具请求"""

    description: Optional[str] = None
    ai_tags: Optional[List[str]] = Field(
        default=None,
        description="预生成的标签（来自 generate 预览）。传入则跳过 AI 分类直接复用",
    )
    content: Optional[str] = Field(
        default=None,
        description="扩展端预先提取的页面正文（document.body.innerText）。"
        "传入则跳过后端 content_extractor，规避反爬/重定向循环。",
    )


class ToolResponse(ToolBase):
    """工具响应"""

    id: int
    ai_tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    visit_count: int = 0
    last_visited_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ToolUpdate(BaseModel):
    """更新工具请求"""

    title: Optional[str] = None
    ai_tags: Optional[List[str]] = None
    description: Optional[str] = None


# ============ 搜索相关 ============


class SearchRequest(BaseModel):
    """搜索请求"""

    query: str = Field(..., min_length=1, description="搜索查询")
    type: str = Field(default="all", description="搜索类型：all | cards | tools")
    limit: int = Field(default=20, ge=1, le=100, description="返回数量")


class SearchResult(BaseModel):
    """搜索结果项"""

    id: int
    title: str
    url: str
    type: str  # card | tool
    summary: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    score: float = Field(description="相关度分数")


class SearchResponse(BaseModel):
    """搜索响应"""

    results: List[SearchResult]
    total: int
    query: str


# ============ AI 相关 ============


class CardGenerationRequest(BaseModel):
    """卡片生成请求"""

    url: str = Field(..., description="要分析的 URL")
    content: Optional[str] = Field(
        default=None,
        description="扩展端预先提取的页面正文。传入则跳过后端 content_extractor。",
    )


class CardGenerationResponse(BaseModel):
    """卡片生成响应"""

    title: str = Field(description="AI 生成的标题")
    summary: str = Field(description="AI 生成的摘要")
    key_points: List[str] = Field(description="关键观点")
    tags: List[str] = Field(description="AI 生成的标签")


class ToolGenerationRequest(BaseModel):
    """工具生成请求"""

    url: str = Field(..., description="要分析的 URL")
    content: Optional[str] = Field(
        default=None,
        description="扩展端预先提取的页面正文。传入则跳过后端 content_extractor。",
    )


class ToolGenerationResponse(BaseModel):
    """工具生成响应"""

    title: str = Field(description="AI 生成的工具名称")
    description: str = Field(default="", description="AI 生成的工具描述")
    tags: List[str] = Field(description="AI 生成的标签")


# ============ 通用 ============


class MessageResponse(BaseModel):
    """通用消息响应"""

    message: str
    data: Optional[dict] = None


class ErrorResponse(BaseModel):
    """错误响应"""

    detail: str
    error_code: Optional[str] = None


# ============ 智能分流相关 ============


class ClassifyRequest(BaseModel):
    """智能分流请求"""

    url: str = Field(..., description="要分类的 URL")
    title: Optional[str] = Field(
        default=None, description="页面标题（扩展端可传入，辅助分类）"
    )
    content: Optional[str] = Field(
        default=None,
        description="扩展端预先提取的页面正文。传入则跳过后端 content_extractor。",
    )


class ClassifyResponse(BaseModel):
    """智能分流响应"""

    type: str = Field(..., description="类型：article | tool | video")
    tags: List[str] = Field(default_factory=list, description="AI 生成的标签")
    title: Optional[str] = Field(None, description="抽取到的页面标题")
