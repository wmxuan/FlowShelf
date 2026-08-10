"""
系统设置 API 路由

健康检查 + AI 配置热更新。
"""

from fastapi import APIRouter

from app.api.deps import AppSettings
from app.core.provider_manager import get_provider_manager
from app.db.schemas.schemas import HealthResponse, SettingsUpdateResponse

router = APIRouter(tags=["system"])

_PLACEHOLDER_KEYS = {"sk-test-placeholder", "sk-test", "sk-placeholder", ""}


def _has_valid_api_key(settings) -> bool:
    """判断 API Key 是否有效（非空且非占位符）"""
    return (
        bool(settings.OPENAI_API_KEY)
        and settings.OPENAI_API_KEY not in _PLACEHOLDER_KEYS
    )


@router.get("/api/health", response_model=HealthResponse)
async def health_check(settings: AppSettings):
    """健康检查"""
    has_valid_key = _has_valid_api_key(settings)
    # 检测本地 Embedding 是否可用
    has_embedding = False
    try:
        from app.providers.local_embedding import _is_sentence_transformers_available

        has_embedding = _is_sentence_transformers_available()
    except Exception:
        pass
    return HealthResponse(
        status="ok",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        demo_mode=settings.DEMO_MODE,
        has_api_key=has_valid_key,
        ai_mode="real" if has_valid_key else "demo",
        has_embedding=has_embedding,
    )


@router.post("/api/settings/api-key", response_model=SettingsUpdateResponse)
async def set_api_key(request_body: dict):
    """前端设置 AI 配置（运行时生效，不写 .env）

    - api_key: 非空时覆盖，空字符串表示清除
    - base_url: 非空时覆盖，空字符串/不传时保留已有值
    - model: 非空时覆盖，空字符串/不传时保留已有值
    """
    manager = get_provider_manager()
    result = manager.update_config(
        api_key=request_body.get("api_key", ""),
        base_url=request_body.get("base_url"),
        model=request_body.get("model"),
    )
    return SettingsUpdateResponse(**result)
