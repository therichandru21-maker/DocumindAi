"""
DocuMind AI - AI Service

Handles Gemini-powered answer generation.
"""

import os

from dotenv import load_dotenv
from google import genai


# --------------------------------------------------
# Environment
# --------------------------------------------------

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not configured in .env"
    )


# --------------------------------------------------
# Gemini Client
# --------------------------------------------------

client = genai.Client(
    api_key=GEMINI_API_KEY
)


# --------------------------------------------------
# Model
# --------------------------------------------------

MODEL_NAME = "gemini-3.6-flash"


# --------------------------------------------------
# Generate Answer
# --------------------------------------------------

def generate_answer(
    question: str,
    context: str,
) -> str:
    """
    Generate an answer using only the retrieved
    document context.
    """

    if not context.strip():
        return (
            "I couldn't find relevant information "
            "in the uploaded documents."
        )

    prompt = f"""
You are DocuMind AI, a document-based AI assistant.

Answer the user's question using ONLY the
information provided in the document context.

Do not invent information.
If the answer is not present in the context,
clearly say that the information was not found.

Keep the answer concise and clear.

DOCUMENT CONTEXT:
{context}

USER QUESTION:
{question}

ANSWER:
"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
        )

        answer = response.text

        if not answer:
            return (
                "I couldn't generate an answer "
                "from the provided document."
            )

        return answer.strip()

    except Exception as exc:
        print("GEMINI ERROR:",repr(exc),)
        raise 