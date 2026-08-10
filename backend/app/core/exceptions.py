"""
FlowShelf 统一异常体系

- ErrorCode: 枚举所有业务错误码，前端可据此做国际化/差异化处理
- AppException: 业务层统一异常，自动映射 HTTP 状态码
- 全局 exception handler: 注册到 FastAPI，保证所有错误响应格式一致

响应格式：
    {"error_code": "NOT_FOUND", "detail": "卡片不存在"}
"""

from enum import Enum
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

log = get_logger(__name__)


class ErrorCode(str, Enum):
    """统一错误码"""

    # ── 通用 4xx ──
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    BAD_REQUEST = "BAD_REQUEST"

    # ── AI 调用 5xx ──
    AI_TIMEOUT = "AI_TIMEOUT"
    AI_RATE_LIMIT = "AI_RATE_LIMIT"
    AI_CALL_FAILED = "AI_CALL_FAILED"
    AI_OUTPUT_INVALID = "AI_OUTPUT_INVALID"

    # ── 内容处理 ──
    CONTENT_EXTRACTION_FAILED = "CONTENT_EXTRACTION_FAILED"

    # ── 业务流程 ──
    CARD_GENERATION_FAILED = "CARD_GENERATION_FAILED"
    TOOL_GENERATION_FAILED = "TOOL_GENERATION_FAILED"
    LEARNING_SAVE_FAILED = "LEARNING_SAVE_FAILED"
    LEARNING_CONVERT_FAILED = "LEARNING_CONVERT_FAILED"
    LEARNING_ENRICH_FAILED = "LEARNING_ENRICH_FAILED"

    # ── 内部错误 ──
    INTERNAL_ERROR = "INTERNAL_ERROR"


# ErrorCode → HTTP status_code 映射
_ERROR_STATUS_MAP: dict[ErrorCode, int] = {
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.BAD_REQUEST: 400,
    ErrorCode.AI_TIMEOUT: 504,
    ErrorCode.AI_RATE_LIMIT: 503,
    ErrorCode.AI_CALL_FAILED: 502,
    ErrorCode.AI_OUTPUT_INVALID: 502,
    ErrorCode.CONTENT_EXTRACTION_FAILED: 422,
    ErrorCode.CARD_GENERATION_FAILED: 502,
    ErrorCode.TOOL_GENERATION_FAILED: 502,
    ErrorCode.LEARNING_SAVE_FAILED: 502,
    ErrorCode.LEARNING_CONVERT_FAILED: 502,
    ErrorCode.LEARNING_ENRICH_FAILED: 502,
    ErrorCode.INTERNAL_ERROR: 500,
}


class AppException(Exception):
    """统一业务异常

    用法：
        raise AppException(ErrorCode.NOT_FOUND, detail="卡片不存在")
        raise AppException(ErrorCode.AI_CALL_FAILED, detail="AI 调用超时")
    """

    def __init__(
        self,
        error_code: ErrorCode,
        detail: str = "",
    ):
        self.error_code = error_code
        self.detail = detail or error_code.value
        self.status_code = _ERROR_STATUS_MAP.get(error_code, 500)
        super().__init__(self.detail)

    def to_dict(self) -> dict:
        return {"error_code": self.error_code.value, "detail": self.detail}


# ── 全局 exception handlers ──


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    """处理 AppException"""
    log.warning(
        "app_exception",
        error_code=exc.error_code.value,
        status_code=exc.status_code,
        detail=exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(),
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """兜底：未捕获异常 → 500，不暴露内部细节"""
    log.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        exc_type=exc.__class__.__name__,
    )
    return JSONResponse(
        status_code=500,
        content={"error_code": ErrorCode.INTERNAL_ERROR.value, "detail": "内部错误"},
    )
