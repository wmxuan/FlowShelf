"""
FlowShelf 日志配置

基于 structlog + 标准 logging：
- 开发环境：彩色控制台，可读性强
- 生产环境：JSON 格式，高性能，方便 ELK/日志平台解析
- SQLAlchemy 引擎日志默认 INFO（可配置）
"""

import logging
import sys

import structlog


def setup_logging(log_level: str = "INFO", debug: bool = False) -> None:
    """初始化全局日志配置

    Args:
        log_level: 日志级别（DEBUG/INFO/WARNING/ERROR）
        debug: 是否开发模式（True 时用彩色控制台，False 时用 JSON）
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    # 1. 配置标准库 logging 基础
    logging.basicConfig(
        format="%(message)s",  # structlog 接管格式化
        stream=sys.stdout,
        level=level,
        force=True,
    )

    # 2. SQLAlchemy 引擎日志
    # - INFO: 输出 SQL 语句（开发调试用）
    # - WARNING: 生产环境只记录慢查询警告
    sa_level = logging.INFO if debug else logging.WARNING
    logging.getLogger("sqlalchemy.engine").setLevel(sa_level)
    logging.getLogger("sqlalchemy.pool").setLevel(sa_level)
    # 静默 sqlalchemy 其他子模块的噪声日志
    logging.getLogger("sqlalchemy.orm").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.sql").setLevel(logging.WARNING)

    # 3. 静音第三方库的噪声日志
    for noisy in (
        "httpcore",
        "httpx",
        "openai._base_client",
        "urllib3",
        "sentence_transformers",
        "transformers",
        "PIL",
        "filelock",
        "torch",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # 4. 配置 structlog 处理器链
    if debug:
        # 开发模式：彩色控制台输出
        processors = [
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="%H:%M:%S", utc=False),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(
                colors=True,
                level_styles={
                    "debug": "\033[36m",      # cyan
                    "info": "\033[32m",       # green
                    "warning": "\033[33m",    # yellow
                    "error": "\033[31m",      # red
                    "critical": "\033[1;31m", # bold red
                },
            ),
        ]
    else:
        # 生产模式：JSON 输出（高性能，适合日志平台）
        processors = [
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=False),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # 5. 启动日志
    log = structlog.get_logger()
    log.info(
        "logging_initialized",
        log_level=log_level,
        debug=debug,
        sa_level=logging.getLevelName(sa_level),
    )


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """获取 structlog logger（推荐使用方式）

    用法：
        log = get_logger(__name__)
        log.info("request_received", path="/api/cards", method="GET")
    """
    return structlog.get_logger(name)
