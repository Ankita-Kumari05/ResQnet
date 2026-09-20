"""
ResQnet Core Application Exceptions
Centralized exception classes following the frozen API error envelope contract.
"""
from typing import Any, Optional


class AppException(Exception):
    """Base exception for all domain and application errors."""

    def __init__(
        self,
        message: str,
        code: str = "APPLICATION_ERROR",
        status_code: int = 400,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class NotFoundException(AppException):
    def __init__(self, message: str = "Resource not found", code: str = "NOT_FOUND", details: Optional[Any] = None):
        super().__init__(message=message, code=code, status_code=404, details=details)


class BadRequestException(AppException):
    def __init__(self, message: str = "Invalid request", code: str = "BAD_REQUEST", details: Optional[Any] = None):
        super().__init__(message=message, code=code, status_code=400, details=details)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized", code: str = "UNAUTHORIZED", details: Optional[Any] = None):
        super().__init__(message=message, code=code, status_code=401, details=details)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Forbidden", code: str = "FORBIDDEN", details: Optional[Any] = None):
        super().__init__(message=message, code=code, status_code=403, details=details)


class ConflictException(AppException):
    def __init__(self, message: str = "Resource conflict", code: str = "CONFLICT", details: Optional[Any] = None):
        super().__init__(message=message, code=code, status_code=409, details=details)


class ValidationException(AppException):
    def __init__(self, message: str = "Validation failed", code: str = "VALIDATION_ERROR", details: Optional[Any] = None):
        super().__init__(message=message, code=code, status_code=422, details=details)


class DatabaseException(AppException):
    def __init__(self, message: str = "Database operation failed", code: str = "DATABASE_ERROR", details: Optional[Any] = None):
        super().__init__(message=message, code=code, status_code=500, details=details)
