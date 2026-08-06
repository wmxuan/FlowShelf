"""
FlowShelf 后端配置
"""
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    """应用配置"""
    
    # 应用信息
    APP_NAME: str = "FlowShelf API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 数据库
    DATABASE_URL: str = "sqlite+aiosqlite:///./flowshelf.db"
    
    # AI 配置
    DATABASE_URL: str = "sqlite+aiosqlite:///./flowshelf.db"
    
    # AI 配置
    OPENAI_API_KEY: str = "sk-test-placeholder"
    DATABASE_URL: str = "sqlite+aiosqlite:///./flowshelf.db"
    
    # AI 配置
    DEMO_MODE: bool = True
    AI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    AI_MAX_TOKENS: int = 500
    AI_TEMPERATURE: float = 0.3
    
    # 服务器
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    
    # 正文抽取
    MAX_CONTENT_LENGTH: int = 50000  # 最大处理字符数
    CONTENT_TIMEOUT: int = 10  # 正文抽取超时（秒）
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """获取单例配置"""
    return Settings()