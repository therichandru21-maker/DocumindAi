"""
DocuMind AI - Document Routes

Features:
- PDF upload
- 20 MB file-size validation
- Text extraction
- Text chunking
- Sentence Transformer embeddings
- FAISS vector indexing
- Semantic document search
- Duplicate document prevention
- Document metadata
- Upload date
- File size
- Document listing
- Document deletion
"""

from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
import json

import faiss
import numpy as np

from fastapi import APIRouter, File, HTTPException, UploadFile
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer


# ==================================================
# Router
# ==================================================

router = APIRouter(
    prefix="/documents",
    tags=["Documents"],
)


# ==================================================
# Paths
# ==================================================

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
INDEX_DIR = DATA_DIR / "index"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
INDEX_DIR.mkdir(parents=True, exist_ok=True)


# ==================================================
# Configuration
# ==================================================

ALLOWED_EXTENSIONS = {".pdf"}

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

CHUNK_SIZE = 800
CHUNK_OVERLAP = 120

EMBEDDING_MODEL_NAME = (
    "sentence-transformers/all-MiniLM-L6-v2"
)


# ==================================================
# Embedding Model
# ==================================================

embedding_model = SentenceTransformer(
    EMBEDDING_MODEL_NAME
)


# ==================================================
# Index Files
# ==================================================

FAISS_INDEX_FILE = INDEX_DIR / "documents.faiss"
METADATA_FILE = INDEX_DIR / "metadata.json"


# ==================================================
# Metadata Helpers
# ==================================================

def load_metadata() -> list:
    """
    Load chunk metadata from disk.
    """

    if not METADATA_FILE.exists():
        return []

    try:
        with open(
            METADATA_FILE,
            "r",
            encoding="utf-8",
        ) as file:

            data = json.load(file)

        if isinstance(data, list):
            return data

        return []

    except Exception:
        return []


def save_metadata(metadata: list) -> None:
    """
    Save metadata to disk.
    """

    with open(
        METADATA_FILE,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            metadata,
            file,
            indent=2,
            ensure_ascii=False,
        )


# ==================================================
# FAISS Helpers
# ==================================================

def load_index():
    """
    Load existing FAISS index.
    """

    if not FAISS_INDEX_FILE.exists():
        return None

    try:

        return faiss.read_index(
            str(FAISS_INDEX_FILE)
        )

    except Exception:

        return None


def save_index(index) -> None:
    """
    Save FAISS index.
    """

    faiss.write_index(
        index,
        str(FAISS_INDEX_FILE),
    )


# ==================================================
# PDF Extraction
# ==================================================

def extract_pdf_text(
    file_path: Path,
) -> tuple[str, int]:
    """
    Extract text from all PDF pages.
    """

    reader = PdfReader(
        str(file_path)
    )

    pages = []
    pages_processed = 0

    for page in reader.pages:

        text = page.extract_text()

        if text:

            text = text.strip()

            if text:
                pages.append(text)

        pages_processed += 1

    full_text = "\n\n".join(pages)

    return (
        full_text,
        pages_processed,
    )


# ==================================================
# Text Chunking
# ==================================================

def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """
    Split text into overlapping chunks.
    """

    text = text.strip()

    if not text:
        return []

    if overlap >= chunk_size:

        raise ValueError(
            "Chunk overlap must be smaller than chunk size."
        )

    chunks = []

    start = 0
    text_length = len(text)

    while start < text_length:

        end = min(
            start + chunk_size,
            text_length,
        )

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        start = end - overlap

    return chunks


# ==================================================
# Embeddings
# ==================================================

def create_embeddings(
    chunks: list[str],
) -> np.ndarray:
    """
    Generate normalized embeddings.
    """

    embeddings = embedding_model.encode(
        chunks,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return embeddings.astype(
        "float32"
    )


# ==================================================
# Duplicate Check
# ==================================================

def document_already_indexed(
    filename: str,
) -> bool:

    metadata = load_metadata()

    for item in metadata:

        if item.get(
            "filename"
        ) == filename:

            return True

    return False


# ==================================================
# Add To Vector Store
# ==================================================

def add_to_vector_store(
    chunks: list[str],
    filename: str,
    stored_filename: str,
    file_size: int,
    upload_date: str,
) -> int:
    """
    Add document chunks to FAISS
    and save metadata.
    """

    if not chunks:
        return 0

    embeddings = create_embeddings(
        chunks
    )

    dimension = embeddings.shape[1]

    index = load_index()

    if index is None:

        index = faiss.IndexFlatIP(
            dimension
        )

    if index.d != dimension:

        raise ValueError(
            "Embedding dimension does not match existing index."
        )

    starting_id = index.ntotal

    index.add(embeddings)

    save_index(index)

    metadata = load_metadata()

    for i, chunk in enumerate(chunks):

        metadata.append(
            {
                "id": starting_id + i,
                "filename": filename,
                "stored_filename": stored_filename,
                "chunk_index": i,
                "text": chunk,
                "file_size": file_size,
                "upload_date": upload_date,
            }
        )

    save_metadata(metadata)

    return len(chunks)


# ==================================================
# Upload Document
# ==================================================

@router.post(
    "/upload",
    summary="Upload Document",
)
async def upload_document(
    file: UploadFile = File(...),
):
    """
    Upload, process and index a PDF.
    """

    # --------------------------------------------------
    # Validate filename
    # --------------------------------------------------

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="Filename is required.",
        )

    original_filename = Path(
        file.filename
    ).name

    extension = Path(
        original_filename
    ).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:

        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Only PDF files are supported.",
        )

    # --------------------------------------------------
    # Duplicate check
    # --------------------------------------------------

    if document_already_indexed(
        original_filename
    ):

        return {
            "success": True,
            "already_indexed": True,
            "filename": original_filename,
            "message": (
                "This document is already indexed. "
                "Duplicate indexing was skipped."
            ),
        }

    # --------------------------------------------------
    # Read file
    # --------------------------------------------------

    try:

        file_content = await file.read()

        file_size = len(
            file_content
        )

        if file_size == 0:

            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty.",
            )

        # --------------------------------------------------
        # File size validation
        # --------------------------------------------------

        if file_size > MAX_FILE_SIZE:

            raise HTTPException(
                status_code=413,
                detail=(
                    "File is too large. "
                    "Maximum allowed size is 20 MB."
                ),
            )

    except HTTPException:
        raise

    except Exception as exc:

        print(
            "FILE READ ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to read uploaded file.",
        )

    # --------------------------------------------------
    # Stored filename
    # --------------------------------------------------

    stored_filename = (
        f"{uuid4().hex}{extension}"
    )

    file_path = (
        UPLOAD_DIR / stored_filename
    )

    # --------------------------------------------------
    # Save file
    # --------------------------------------------------

    try:

        with open(
            file_path,
            "wb",
        ) as output_file:

            output_file.write(
                file_content
            )

    except Exception as exc:

        print(
            "FILE SAVE ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to save uploaded document.",
        )

    # --------------------------------------------------
    # Upload timestamp
    # --------------------------------------------------

    upload_date = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    # --------------------------------------------------
    # Extract → Chunk → Embed → Index
    # --------------------------------------------------

    try:

        text, pages_processed = (
            extract_pdf_text(
                file_path
            )
        )

        if not text.strip():

            raise ValueError(
                "No extractable text was found in the PDF."
            )

        chunks = chunk_text(
            text
        )

        if not chunks:

            raise ValueError(
                "No text chunks could be created."
            )

        chunks_created = add_to_vector_store(
            chunks=chunks,
            filename=original_filename,
            stored_filename=stored_filename,
            file_size=file_size,
            upload_date=upload_date,
        )

        return {
            "success": True,
            "already_indexed": False,
            "filename": original_filename,
            "stored_filename": stored_filename,
            "file_size": file_size,
            "file_size_mb": round(
                file_size / (1024 * 1024),
                2,
            ),
            "upload_date": upload_date,
            "pages_processed": pages_processed,
            "chunks_created": chunks_created,
            "message": (
                "Document uploaded, processed "
                "and indexed successfully."
            ),
        }

    except Exception as exc:

        print(
            "\n=============================="
        )

        print(
            "DOCUMENT PROCESSING ERROR:"
        )

        print(
            repr(exc)
        )

        print(
            "==============================\n"
        )

        try:

            if file_path.exists():
                file_path.unlink()

        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to process and index "
                "the document."
            ),
        )


# ==================================================
# Search Documents
# ==================================================

@router.get(
    "/search",
    summary="Search indexed documents",
)
async def search_documents(
    query: str,
    top_k: int = 5,
):
    """
    Semantic search using FAISS.
    """

    query = query.strip()

    if not query:

        raise HTTPException(
            status_code=400,
            detail="Search query cannot be empty.",
        )

    if top_k < 1:

        raise HTTPException(
            status_code=400,
            detail="top_k must be at least 1.",
        )

    index = load_index()
    metadata = load_metadata()

    if (
        index is None
        or index.ntotal == 0
    ):

        return {
            "success": True,
            "query": query,
            "results": [],
            "total_results": 0,
            "message": "No indexed documents found.",
        }

    try:

        query_embedding = create_embeddings(
            [query]
        )

        search_k = min(
            max(top_k * 10, top_k),
            index.ntotal,
        )

        scores, indices = index.search(
            query_embedding,
            search_k,
        )

        results = []

        seen = set()

        for score, idx in zip(
            scores[0],
            indices[0],
        ):

            if idx < 0:
                continue

            if idx >= len(metadata):
                continue

            item = metadata[idx]

            filename = item.get(
                "filename"
            )

            chunk_index = item.get(
                "chunk_index"
            )

            text = item.get(
                "text"
            )

            unique_key = (
                filename,
                chunk_index,
                text,
            )

            if unique_key in seen:
                continue

            seen.add(
                unique_key
            )

            results.append(
                {
                    "score": float(score),
                    "filename": filename,
                    "stored_filename": item.get(
                        "stored_filename"
                    ),
                    "chunk_index": chunk_index,
                    "text": text,
                    "file_size": item.get(
                        "file_size"
                    ),
                    "upload_date": item.get(
                        "upload_date"
                    ),
                }
            )

            if len(results) >= top_k:
                break

        return {
            "success": True,
            "query": query,
            "results": results,
            "total_results": len(results),
        }

    except Exception as exc:

        print(
            "SEARCH ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to search indexed documents.",
        )


# ==================================================
# Index Status
# ==================================================

@router.get(
    "/status",
    summary="Get document index status",
)
async def document_index_status():

    index = load_index()
    metadata = load_metadata()

    unique_documents = set()

    for item in metadata:

        filename = item.get(
            "filename"
        )

        if filename:
            unique_documents.add(
                filename
            )

    if index is None:

        return {
            "success": True,
            "indexed": False,
            "vectors": 0,
            "metadata_entries": len(metadata),
            "unique_documents": len(
                unique_documents
            ),
        }

    return {
        "success": True,
        "indexed": True,
        "vectors": index.ntotal,
        "dimension": index.d,
        "metadata_entries": len(metadata),
        "unique_documents": len(
            unique_documents
        ),
    }


# ==================================================
# List Documents
# ==================================================

@router.get(
    "/list",
    summary="List uploaded documents",
)
async def list_documents():
    """
    Return unique indexed documents
    with metadata.
    """

    metadata = load_metadata()

    documents = {}

    for item in metadata:

        filename = item.get(
            "filename"
        )

        if not filename:
            continue

        if filename not in documents:

            file_size = item.get(
                "file_size",
                0,
            )

            upload_date = item.get(
                "upload_date"
            )

            documents[filename] = {
                "filename": filename,
                "stored_filename": item.get(
                    "stored_filename"
                ),
                "chunks": 0,
                "file_size": file_size,
                "file_size_mb": round(
                    file_size / (1024 * 1024),
                    2,
                ),
                "upload_date": upload_date,
            }

        documents[filename]["chunks"] += 1

    return {
        "success": True,
        "documents": list(
            documents.values()
        ),
        "total_documents": len(
            documents
        ),
    }


# ==================================================
# Delete Document
# ==================================================

@router.delete(
    "/{filename}",
    summary="Delete indexed document",
)
async def delete_document(
    filename: str,
):
    """
    Delete a document from:

    - FAISS index
    - metadata
    - uploads folder
    """

    filename = Path(
        filename
    ).name

    metadata = load_metadata()

    if not metadata:

        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    remaining_metadata = []

    removed_items = []

    for item in metadata:

        if item.get(
            "filename"
        ) == filename:

            removed_items.append(
                item
            )

        else:

            remaining_metadata.append(
                item
            )

    if not removed_items:

        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    # --------------------------------------------------
    # Rebuild FAISS index
    # --------------------------------------------------

    try:

        remaining_embeddings = []

        if remaining_metadata:

            texts = [
                item.get(
                    "text",
                    ""
                )
                for item in remaining_metadata
            ]

            remaining_embeddings = create_embeddings(
                texts
            )

        if remaining_embeddings:

            dimension = (
                remaining_embeddings.shape[1]
            )

            new_index = faiss.IndexFlatIP(
                dimension
            )

            new_index.add(
                remaining_embeddings
            )

            save_index(
                new_index
            )

        else:

            if FAISS_INDEX_FILE.exists():
                FAISS_INDEX_FILE.unlink()

    except Exception as exc:

        print(
            "INDEX REBUILD ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to rebuild document index.",
        )

    # --------------------------------------------------
    # Re-number metadata IDs
    # --------------------------------------------------

    for new_id, item in enumerate(
        remaining_metadata
    ):

        item["id"] = new_id

    save_metadata(
        remaining_metadata
    )

    # --------------------------------------------------
    # Delete physical file
    # --------------------------------------------------

    stored_filename = removed_items[0].get(
        "stored_filename"
    )

    if stored_filename:

        stored_file_path = (
            UPLOAD_DIR /
            Path(stored_filename).name
        )

        try:

            if stored_file_path.exists():
                stored_file_path.unlink()

        except Exception as exc:

            print(
                "UPLOAD DELETE ERROR:",
                repr(exc),
            )

    return {
        "success": True,
        "filename": filename,
        "chunks_deleted": len(
            removed_items
        ),
        "message": (
            f"Document '{filename}' "
            "deleted successfully."
        ),
    }