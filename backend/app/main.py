"""
FastAPI 主入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.database import init_db
from app.api.routes.cards import router as cards_router
from app.api.routes.tools import router as tools_router
from app.api.routes.search import router as search_router


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
    
    # CORS 配置
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # 注册路由
    app.include_router(cards_router)
    app.include_router(tools_router)
    app.include_router(search_router)
    
    @app.get("/api/health")
    async def health_check():
        """健康检查"""
        return {
            "status": "ok",
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "demo_mode": settings.DEMO_MODE,
        }
    
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