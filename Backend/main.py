"""
DocuMind AI - FastAPI backend.

Phase 1:
- FastAPI application setup
- Health endpoint
- Root endpoint
- Global error handling
- CORS support for React frontend
- Document upload route
- Chat / RAG route
- Basic API metadata
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from routes.documents import router as documents_router
from routes.chat import router as chat_router


# --------------------------------------------------
# FastAPI Application
# --------------------------------------------------

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="RAG-based AI Document and Knowledge Assistant",
    docs_url="/docs",
    redoc_url="/redoc",
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Routers
# --------------------------------------------------

app.include_router(documents_router)
app.include_router(chat_router)


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
)
async def health_check() -> dict:
    """
    Check whether the backend is running.
    """

    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


# --------------------------------------------------
# Root Endpoint
# --------------------------------------------------

@app.get(
    "/",
    tags=["System"],
    summary="API information",
)
async def root() -> dict:
    """
    Return basic API information.
    """

    return {
        "message": "Welcome to DocuMind AI",
        "status": "running",
        "docs": "/docs",
    }


# --------------------------------------------------
# Request Validation Error
# --------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
):
    """
    Handle invalid request data gracefully.
    """

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Validation error",
            "details": exc.errors(),
        },
    )


# --------------------------------------------------
# Global Exception Handler
# --------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(
    request: Request,
    exc: Exception,
):
    """
    Handle unexpected errors and print the
    actual exception during development.
    """

    print("\n" + "=" * 60)
    print("GLOBAL ERROR")
    print("=" * 60)
    print(repr(exc))
    print("=" * 60 + "\n")

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "message": str(exc),
        },
    )


# --------------------------------------------------
# Local Development Entry Point
# --------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )