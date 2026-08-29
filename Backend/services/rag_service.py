"""
DocuMind AI - RAG Service

Handles:
- Query embedding
- FAISS retrieval
- Relevant document context
"""

from pathlib import Path
import json

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer


# --------------------------------------------------
# Paths
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

INDEX_DIR = BASE_DIR / "data" / "index"

FAISS_INDEX_FILE = INDEX_DIR / "documents.faiss"
METADATA_FILE = INDEX_DIR / "metadata.json"


# --------------------------------------------------
# Embedding Model
# --------------------------------------------------

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

embedding_model = SentenceTransformer(
    MODEL_NAME
)


# --------------------------------------------------
# Load Metadata
# --------------------------------------------------

def load_metadata() -> list:
    if not METADATA_FILE.exists():
        return []

    try:
        with open(
            METADATA_FILE,
            "r",
            encoding="utf-8",
        ) as file:
            return json.load(file)

    except Exception:
        return []


# --------------------------------------------------
# Retrieve Relevant Documents
# --------------------------------------------------

def retrieve_documents(
    query: str,
    top_k: int = 3,
) -> list:
    """
    Retrieve the most relevant document chunks
    for a user query.
    """

    query = query.strip()

    if not query:
        return []

    if not FAISS_INDEX_FILE.exists():
        return []

    index = faiss.read_index(
        str(FAISS_INDEX_FILE)
    )

    metadata = load_metadata()

    if index.ntotal == 0 or not metadata:
        return []

    # Create query embedding
    query_embedding = embedding_model.encode(
        [query],
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    query_embedding = query_embedding.astype(
        "float32"
    )

    # Search FAISS
    search_k = min(
        top_k,
        index.ntotal,
    )

    scores, indices = index.search(
        query_embedding,
        search_k,
    )

    results = []

    for score, index_id in zip(
        scores[0],
        indices[0],
    ):

        if index_id < 0:
            continue

        if index_id >= len(metadata):
            continue

        item = metadata[index_id]

        results.append(
            {
                "score": float(score),
                "filename": item.get("filename"),
                "chunk_index": item.get("chunk_index"),
                "text": item.get("text", ""),
            }
        )

    return results


# --------------------------------------------------
# Build Context
# --------------------------------------------------

def build_context(
    results: list,
) -> str:
    """
    Convert retrieved chunks into a single
    context string for the AI model.
    """

    if not results:
        return ""

    context_parts = []

    for result in results:

        context_parts.append(
            f"Source: {result['filename']}\n"
            f"Chunk: {result['chunk_index']}\n"
            f"{result['text']}"
        )

    return "\n\n---\n\n".join(
        context_parts
    )