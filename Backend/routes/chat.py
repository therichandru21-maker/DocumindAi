"""
DocuMind AI - Chat Routes

Handles:
- Document-based AI questions
- Chat history
- Persistent chat history storage
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.rag_service import (
    retrieve_documents,
    build_context,
)
from services.ai_service import generate_answer


router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
)


# --------------------------------------------------
# Persistent Storage
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
HISTORY_FILE = BASE_DIR / "data" / "chat_history.json"


def ensure_history_file():
    """
    Create the history file if it does not exist.
    """

    HISTORY_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if not HISTORY_FILE.exists():
        HISTORY_FILE.write_text(
            "[]",
            encoding="utf-8",
        )


def load_chat_history():
    """
    Load chat history from JSON file.
    """

    ensure_history_file()

    try:
        content = HISTORY_FILE.read_text(
            encoding="utf-8"
        )

        if not content.strip():
            return []

        return json.loads(content)

    except (json.JSONDecodeError, OSError):
        return []


def save_chat_history(history):
    """
    Save chat history to JSON file.
    """

    ensure_history_file()

    HISTORY_FILE.write_text(
        json.dumps(
            history,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


# --------------------------------------------------
# Request Model
# --------------------------------------------------

class ChatRequest(BaseModel):
    question: str
    top_k: int = 3


# --------------------------------------------------
# Ask AI
# --------------------------------------------------

@router.post(
    "/ask",
    summary="Ask a question using uploaded documents",
)
async def ask_question(request: ChatRequest):
    """
    Retrieve relevant document chunks,
    generate an AI answer and save the
    conversation to persistent storage.
    """

    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    if request.top_k < 1:
        raise HTTPException(
            status_code=400,
            detail="top_k must be at least 1.",
        )

    # --------------------------------------------------
    # Retrieve relevant documents
    # --------------------------------------------------

    results = retrieve_documents(
        query=question,
        top_k=request.top_k,
    )

    # --------------------------------------------------
    # Build context
    # --------------------------------------------------

    context = build_context(results)

    # --------------------------------------------------
    # Generate AI answer
    # --------------------------------------------------

    answer = generate_answer(
        question=question,
        context=context,
    )

    # --------------------------------------------------
    # Save conversation
    # --------------------------------------------------

    history = load_chat_history()

    conversation = {
        "question": question,
        "answer": answer,
        "sources": results,
    }

    history.append(conversation)

    save_chat_history(history)

    # --------------------------------------------------
    # Response
    # --------------------------------------------------

    return {
        "success": True,
        "question": question,
        "answer": answer,
        "sources": results,
        "total_sources": len(results),
    }


# --------------------------------------------------
# Get Chat History
# --------------------------------------------------

@router.get(
    "/history",
    summary="Get chat history",
)
async def get_chat_history():
    """
    Return all previously saved conversations.
    """

    history = load_chat_history()

    return {
        "success": True,
        "history": history,
        "total": len(history),
    }


# --------------------------------------------------
# Clear Chat History
# --------------------------------------------------

@router.delete(
    "/history",
    summary="Clear chat history",
)
async def clear_chat_history():
    """
    Delete all saved conversations.
    """

    save_chat_history([])

    return {
        "success": True,
        "message": "Chat history cleared successfully.",
    }