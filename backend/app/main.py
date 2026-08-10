"""
FastAPI 主入口
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
import time

from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger
from app.core.database import init_db
from app.api.routes.cards import router as cards_router
from app.api.routes.tools import router as tools_router
from app.api.routes.search import router as search_router
from app.api.routes.classify import router as classify_router
from app.api.routes.tabs import router as tabs_router
from app.api.routes.learning import router as learning_router

_PLACEHOLDER_KEYS = {"sk-test-placeholder", "sk-test", "sk-placeholder", ""}


def _has_valid_api_key(settings) -> bool:
    """判断 API Key 是否有效（非空且非占位符）"""
    return (
        bool(settings.OPENAI_API_KEY)
        and settings.OPENAI_API_KEY not in _PLACEHOLDER_KEYS
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    settings = get_settings()
    # 初始化日志系统（structlog + SQLAlchemy 引擎日志）
    setup_logging(log_level=settings.LOG_LEVEL, debug=settings.DEBUG)
    log = get_logger("app.main")
    log.info(
        "server_starting",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        host=settings.HOST,
        port=settings.PORT,
        debug=settings.DEBUG,
        demo_mode=settings.DEMO_MODE,
        has_api_key=_has_valid_api_key(settings),
    )
    # 启动时初始化数据库
    await init_db()
    log.info(
        "database_initialized",
        db_url=(
            settings.DATABASE_URL.split("///")[-1]
            if "///" in settings.DATABASE_URL
            else "n/a"
        ),
    )
    yield
    log.info("server_shutting_down")


def create_app() -> FastAPI:
    """创建 FastAPI 应用"""
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="""
        **FlowShelf API** - AI 原生的个人数字资产管家
        
        ## 功能模块
        
        - 📚 **卡片管理**：AI 自动生成知识卡片（摘要、观点、标签）
        - 🛠️ **工具箱**：多标签 + 语义检索的收藏管理
        - 🔍 **语义搜索**：用自然语言查找你的数字资产
        """,
        lifespan=lifespan,
    )

    # CORS 配置：放行任意来源。
    # bookmarklet 在任意网页上下文中直接 fetch /api/learning，Origin 不固定；
    # 当前无鉴权，allow_credentials=False（无 cookie 依赖），放行 * 不带来凭据泄露风险。
    # 注意：allow_credentials=False 时，浏览器对跨域 fetch 不发送 cookie，
    # Web 端 fetch 默认 same-origin 不受影响，扩展端 fetch 亦不依赖 cookie。
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 请求/响应日志中间件
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        """记录每个 HTTP 请求的路径、方法、状态码、耗时"""
        log = get_logger("app.http")
        start = time.perf_counter()
        # 跳过健康检查和静态文件的噪声日志
        path = request.url.path
        skip = (
            path == "/api/health"
            or path.startswith("/_next")
            or path.startswith("/assets")
        )
        if not skip:
            log.info(
                "request",
                method=request.method,
                path=path,
                client=request.client.host if request.client else "-",
            )
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        if not skip:
            log.info(
                "response",
                method=request.method,
                path=path,
                status=response.status_code,
                elapsed_ms=round(elapsed_ms, 1),
            )
        return response

    # 注册路由
    app.include_router(cards_router)
    app.include_router(tools_router)
    app.include_router(search_router)
    app.include_router(classify_router)
    app.include_router(tabs_router)
    app.include_router(learning_router)

    @app.get("/api/health")
    async def health_check():
        """健康检查"""
        has_valid_key = _has_valid_api_key(settings)
        # 检测本地 Embedding 是否可用
        has_embedding = False
        try:
            from app.providers.local_embedding import (
                _is_sentence_transformers_available,
                _is_model_downloaded,
            )

            has_embedding = _is_sentence_transformers_available()
        except Exception:
            pass
        return {
            "status": "ok",
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "demo_mode": settings.DEMO_MODE,
            "has_api_key": has_valid_key,
            "ai_mode": "real" if has_valid_key else "demo",
            "has_embedding": has_embedding,
        }

    @app.post("/api/settings/api-key")
    async def set_api_key(request_body: dict):
        """前端设置 AI 配置（运行时生效，不写 .env）

        - api_key: 非空时覆盖，空字符串表示清除
        - base_url: 非空时覆盖，空字符串/不传时保留已有值
        - model: 非空时覆盖，空字符串/不传时保留已有值
        """
        log = get_logger("app.settings")
        api_key = request_body.get("api_key", "")
        base_url = request_body.get("base_url")
        model = request_body.get("model")
        if api_key:
            settings.OPENAI_API_KEY = api_key
            log.info("api_key_set", has_key=True)
        elif "api_key" in request_body:
            settings.OPENAI_API_KEY = ""
            log.info("api_key_cleared")
        if base_url:  # 仅非空时覆盖
            settings.OPENAI_BASE_URL = base_url
            log.info("base_url_set", base_url=base_url)
        if model:  # 仅非空时覆盖
            settings.AI_MODEL = model
            log.info("model_set", model=model)
        has_valid_key = _has_valid_api_key(settings)
        log.info(
            "ai_config_updated",
            ai_mode="real" if has_valid_key else "demo",
            model=settings.AI_MODEL,
            has_base_url=bool(settings.OPENAI_BASE_URL),
        )
        return {
            "ok": True,
            "has_api_key": has_valid_key,
            "ai_mode": "real" if has_valid_key else "demo",
        }

    # 托管前端静态文件（必须在所有 API 路由之后挂载，确保 API 优先匹配）
    frontend_dist = Path(__file__).parent.parent / "frontend_dist"
    if frontend_dist.is_dir():
        app.mount(
            "/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend"
        )

    return app


# 创建应用实例
app = create_app()

if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
