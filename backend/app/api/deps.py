"""
FastAPI 依赖注入

统一管理 DB session、Settings、AI Provider 的获取，
消除路由中重复的 get_settings() + get_ai_provider() 样板代码。

AI Provider 通过 ProviderManager 单例获取，配置热更新即时生效
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.provider_manager import get_provider_manager
from app.providers.base import BaseAIProvider


def _get_ai_provider() -> BaseAIProvider:
    """依赖注入：通过 ProviderManager 获取 AI Provider 单例"""
    return get_provider_manager().get_provider()


# 类型别名，路由中直接用 Annotated 注入
DBSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]
AIProvider = Annotated[BaseAIProvider, Depends(_get_ai_provider)]
