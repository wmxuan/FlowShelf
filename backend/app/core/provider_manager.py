"""
AI Provider 单例管理

- ProviderManager 持有当前 AI Provider 实例，避免每次请求重建
- 配置热更新：前端修改 API Key / Base URL / Model 后，
  调用 update_config() 即时生效，无需重启
- 线程安全：基于 Python GIL + 单进程模型，简单 _instance 变量足够
"""

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.base import BaseAIProvider, get_ai_provider

log = get_logger(__name__)


class ProviderManager:
    """AI Provider 单例管理器

    用法：
        manager = ProviderManager()
        provider = manager.get_provider()          # 获取当前实例
        manager.update_config(api_key="sk-xxx")    # 热更新配置
    """

    def __init__(self):
        self._provider: BaseAIProvider | None = None
        self._config_key: str = ""  # 用于检测配置是否变化

    def get_provider(self) -> BaseAIProvider:
        """获取当前 AI Provider 实例（配置变化时自动重建）"""
        settings = get_settings()
        current_key = self._make_config_key(settings)

        if self._provider is None or current_key != self._config_key:
            self._provider = get_ai_provider(
                demo_mode=settings.DEMO_MODE,
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                model=settings.AI_MODEL,
                embedding_model=settings.EMBEDDING_MODEL,
                max_tokens=settings.AI_MAX_TOKENS,
                temperature=settings.AI_TEMPERATURE,
            )
            self._config_key = current_key
            log.info(
                "provider_created_or_updated",
                ai_mode="real" if not settings.DEMO_MODE else "demo",
                model=settings.AI_MODEL,
            )
        return self._provider

    def update_config(
        self,
        api_key: str = "",
        base_url: str | None = None,
        model: str | None = None,
    ) -> dict:
        """热更新 AI 配置（运行时生效，不写 .env）

        - api_key: 非空时覆盖，空字符串表示清除
        - base_url: 非空时覆盖，None 表示不修改
        - model: 非空时覆盖，None 表示不修改
        """
        settings = get_settings()

        if api_key:
            settings.OPENAI_API_KEY = api_key
            log.info("api_key_set", has_key=True)
        elif api_key == "" and hasattr(settings, "OPENAI_API_KEY"):
            settings.OPENAI_API_KEY = ""
            log.info("api_key_cleared")

        if base_url:
            settings.OPENAI_BASE_URL = base_url
            log.info("base_url_set", base_url=base_url)

        if model:
            settings.AI_MODEL = model
            log.info("model_set", model=model)

        # 标记需要重建 provider
        self._config_key = ""

        has_valid_key = bool(settings.OPENAI_API_KEY) and settings.OPENAI_API_KEY not in {
            "sk-test-placeholder", "sk-test", "sk-placeholder", "",
        }
        return {
            "ok": True,
            "has_api_key": has_valid_key,
            "ai_mode": "real" if has_valid_key else "demo",
        }

    @staticmethod
    def _make_config_key(settings) -> str:
        """生成配置指纹，任一字段变化即重建 provider"""
        return f"{settings.DEMO_MODE}|{settings.OPENAI_API_KEY}|{settings.OPENAI_BASE_URL}|{settings.AI_MODEL}|{settings.AI_MAX_TOKENS}|{settings.AI_TEMPERATURE}"


# 全局单例
_manager = ProviderManager()


def get_provider_manager() -> ProviderManager:
    """获取 ProviderManager 单例"""
    return _manager
