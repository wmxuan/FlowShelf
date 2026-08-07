"""
AI 输出结构化校验 Schema

所有 LLM 结构化输出必须经此处的 Pydantic 模型校验，
保证下游业务拿到的数据类型可控。
"""

from pydantic import BaseModel, Field
from typing import List


class CardAIOutput(BaseModel):
    """卡片生成的 AI 结构化输出"""

    title: str = Field(..., description="不超过 30 字的中文标题")
    summary: str = Field(..., description="100-200 字中文摘要")
    key_points: List[str] = Field(default_factory=list, description="3-5 条核心观点")
    tags: List[str] = Field(default_factory=list, description="3-5 个标签")


class ToolClassificationOutput(BaseModel):
    """工具分类的 AI 结构化输出"""

    type: str = Field(..., description="类型：tool | article | video")
    tags: List[str] = Field(default_factory=list, description="标签列表")


class ToolGenerationOutput(BaseModel):
    """工具生成的 AI 结构化输出（预览用，不写库）"""

    title: str = Field(..., description="不超过 30 字的工具名称")
    description: str = Field(default="", description="20-60 字工具作用描述")
    tags: List[str] = Field(default_factory=list, description="3-5 个标签")
