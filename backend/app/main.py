"""
FastAPI 主入口
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path

from app.core.config import get_settings
from app.core.database import init_db
from app.api.routes.cards import router as cards_router
from app.api.routes.tools import router as tools_router
from app.api.routes.search import router as search_router
from app.api.routes.classify import router as classify_router
from app.api.routes.tabs import router as tabs_router
from app.api.routes.learning import router as learning_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    # 启动时初始化数据库
    await init_db()
    yield
    # 关闭时清理资源（如有）


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
        return {
            "status": "ok",
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "demo_mode": settings.DEMO_MODE,
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
