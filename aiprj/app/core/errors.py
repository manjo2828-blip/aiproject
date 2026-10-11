import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app.errors")


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _resp(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return _resp(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        errs = exc.errors()
        loc = ".".join(str(p) for p in errs[0].get("loc", ())[1:]) if errs else ""
        if any(e.get("type") == "missing" for e in errs):
            return _resp(400, "MISSING_FIELD", ("필수 항목이 빠졌어요: " + loc) if loc else "필수 항목이 빠졌어요")
        return _resp(400, "INVALID_PARAM", ("값이 올바르지 않아요: " + loc) if loc else "값이 올바르지 않아요")

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        mapping = {
            404: ("NOT_FOUND", "찾을 수 없는 주소예요"),
            405: ("METHOD_NOT_ALLOWED", "허용되지 않는 요청 방식이에요"),
            413: ("FILE_TOO_LARGE", "파일이 너무 커요"),
        }
        code, msg = mapping.get(exc.status_code, ("HTTP_ERROR", "요청을 처리할 수 없어요"))
        return _resp(exc.status_code, code, msg)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s", request.url.path)
        return _resp(500, "INTERNAL_ERROR", "앗, 서버에 문제가 생겼어요. 잠시 후 다시 해봐요")
