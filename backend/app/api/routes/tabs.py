"""
Tab 管理 API 路由

提供 Tab 数量统计 + AI 智能归组能力。
扩展端通过 chrome.tabs.query 获取当前所有 Tab，传给后端 AI 进行主题聚类。
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.providers.base import get_ai_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tabs", tags=["tabs"])


class TabInfoInput(BaseModel):
    """单个标签页信息"""

    url: str
    title: str = ""
    favIconUrl: Optional[str] = None


class TabGroupRequest(BaseModel):
    """Tab 归组请求"""

    tabs: List[TabInfoInput]


class TabGroupResponse(BaseModel):
    """Tab 归组响应"""

    groups: list[dict]
    total: int
    group_count: int


class GroupContextInput(BaseModel):
    """已有分组上下文（用于单标签分组）"""

    name: str
    count: int = 0
    sample_tabs: List[TabInfoInput] = []


class TabAssignRequest(BaseModel):
    """单标签分组请求"""

    tab: TabInfoInput
    existing_groups: List[GroupContextInput] = []


class TabAssignResponse(BaseModel):
    """单标签分组响应"""

    action: str  # "assign" | "create"
    group_name: str


@router.post("/group", response_model=TabGroupResponse)
async def group_tabs(request: TabGroupRequest):
    """
    AI Tab 归组：将多个标签页按主题相似度聚类分组。

    DEMO_MODE 下按域名简单分组；真实模式由 LLM 进行语义聚类。
    """
    settings = get_settings()
    ai_provider = get_ai_provider(
        demo_mode=settings.DEMO_MODE,
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
        model=settings.AI_MODEL,
        embedding_model=settings.EMBEDDING_MODEL,
        max_tokens=settings.AI_MAX_TOKENS,
        temperature=settings.AI_TEMPERATURE,
    )

    tabs_data = [t.model_dump() for t in request.tabs]
    total = len(tabs_data)

    if total == 0:
        return TabGroupResponse(groups=[], total=0, group_count=0)

    try:
        result = await ai_provider.group_tabs(tabs_data)
        groups = result.get("groups", [])
    except Exception as exc:
        logger.warning("AI Tab 归组失败，降级为单组：%s", exc)
        groups = [{"name": "全部标签", "tab_indices": list(range(total))}]

    return TabGroupResponse(
        groups=groups,
        total=total,
        group_count=len(groups),
    )


@router.post("/assign", response_model=TabAssignResponse)
async def assign_tab(request: TabAssignRequest):
    """
    AI 单标签分组：将一个新标签页分配到已有分组或创建新分组。

    仅传入新标签 + 已有分组名称（而非全部标签），大幅减少 token 消耗。
    适用于标签实时同步场景（新增标签 / URL 变化）。
    """
    settings = get_settings()
    ai_provider = get_ai_provider(
        demo_mode=settings.DEMO_MODE,
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
        model=settings.AI_MODEL,
        embedding_model=settings.EMBEDDING_MODEL,
        max_tokens=settings.AI_MAX_TOKENS,
        temperature=settings.AI_TEMPERATURE,
    )

    tab_data = request.tab.model_dump()
    groups_data = [
        {
            "name": g.name,
            "count": g.count,
            "sample_tabs": [t.model_dump() for t in g.sample_tabs],
        }
        for g in request.existing_groups
    ]

    try:
        result = await ai_provider.assign_tab_to_group(tab_data, groups_data)
    except Exception as exc:
        logger.warning("AI 单标签分组失败，降级为创建新组：%s", exc)
        result = {"action": "create", "group_name": "新标签"}

    return TabAssignResponse(
        action=result.get("action", "create"),
        group_name=result.get("group_name", "新标签"),
    )
