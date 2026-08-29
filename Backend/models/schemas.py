"""
Pydantic schemas used by the API.
"""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str
    version: str
    environment: str


class ErrorResponse(BaseModel):
    """Standard API error response."""

    success: bool
    error: str
    message: str | None = None