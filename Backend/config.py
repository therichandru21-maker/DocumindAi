"""
Application configuration.

All secrets and environment-specific settings are loaded
from environment variables.
"""

import os
from pathlib import Path

from dotenv import load_dotenv


# Project root
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env from project root
load_dotenv(BASE_DIR / ".env")


class Settings:
    """Central application settings."""

    APP_NAME: str = os.getenv(
        "APP_NAME",
        "DocuMind AI"
    )

    APP_VERSION: str = os.getenv(
        "APP_VERSION",
        "1.0.0"
    )

    ENVIRONMENT: str = os.getenv(
        "ENVIRONMENT",
        "development"
    )

    HOST: str = os.getenv(
        "HOST",
        "127.0.0.1"
    )

    PORT: int = int(
        os.getenv("PORT", "8000")
    )

    # API key is read from environment only.
    GEMINI_API_KEY: str = os.getenv(
        "GEMINI_API_KEY",
        ""
    )

    # Storage
    UPLOAD_DIR: Path = BASE_DIR / "data" / "uploads"

    # File limits
    MAX_FILE_SIZE_MB: int = int(
        os.getenv("MAX_FILE_SIZE_MB", "20")
    )

    ALLOWED_EXTENSIONS: set[str] = {
        ".pdf",
        ".txt",
        ".docx",
    }


settings = Settings()

# Make sure upload directory exists
settings.UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True
)