import os
import re
import json
import uuid
import zipfile
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
from difflib import SequenceMatcher

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ============================================================
# OPTIONAL DOCUMENT LIBRARIES
# ============================================================

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None

try:
    from docx import Document
except Exception:
    Document = None

try:
    from pptx import Presentation
except Exception:
    Presentation = None

try:
    from openpyxl import load_workbook
except Exception:
    load_workbook = None


# ============================================================
# GEMINI
# ============================================================

try:
    from google import genai
except Exception:
    genai = None


# ============================================================
# CONFIG
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"

DOCUMENTS_FILE = DATA_DIR / "documents.json"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)


SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".pptx",
    ".xlsx",
    ".txt",
    ".zip",
}


MAX_FILE_SIZE = 20 * 1024 * 1024


# IMPORTANT:
# Smaller chunks make search much more specific.
CHUNK_SIZE = 250
CHUNK_OVERLAP = 50


# Search settings
MAX_SEARCH_RESULTS = 8
MAX_RESULTS_PER_DOCUMENT = 4

# Lower threshold than your old version.
MIN_SEARCH_SCORE = 0.05


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="DocuMind AI",
    description="Intelligent Document Knowledge Assistant",
    version="3.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# MODELS
# ============================================================

class AskRequest(BaseModel):
    question: str


class SearchRequest(BaseModel):
    query: str


# ============================================================
# STORAGE
# ============================================================

def load_documents() -> List[Dict[str, Any]]:

    if not DOCUMENTS_FILE.exists():
        return []

    try:
        with open(
            DOCUMENTS_FILE,
            "r",
            encoding="utf-8",
        ) as f:

            data = json.load(f)

        if isinstance(data, list):
            return data

        return []

    except Exception as exc:

        print("Could not load documents:", exc)

        return []


def save_documents(
    documents: List[Dict[str, Any]]
) -> None:

    temp_file = DOCUMENTS_FILE.with_suffix(".tmp")

    with open(
        temp_file,
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            documents,
            f,
            indent=2,
            ensure_ascii=False,
        )

    temp_file.replace(DOCUMENTS_FILE)


# ============================================================
# TEXT CLEANING
# ============================================================

def clean_text(text: str) -> str:

    if not text:
        return ""

    text = text.replace(
        "\x00",
        " ",
    )

    # Preserve sentence boundaries.
    text = re.sub(
        r"[ \t]+",
        " ",
        text,
    )

    text = re.sub(
        r"\n\s*\n+",
        "\n\n",
        text,
    )

    return text.strip()


def normalize_text(text: str) -> str:

    text = text.lower()

    text = text.replace(
        "_",
        " ",
    )

    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


# ============================================================
# STOP WORDS
# ============================================================

STOP_WORDS = {
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "and",
    "or",
    "but",
    "as",
    "at",
    "by",
    "from",
    "into",
    "about",
    "what",
    "which",
    "who",
    "when",
    "where",
    "why",
    "how",
    "can",
    "could",
    "would",
    "should",
    "do",
    "does",
    "did",
    "your",
    "you",
    "my",
    "me",
    "this",
    "that",
    "these",
    "those",
    "tell",
    "give",
    "show",
    "please",
}


def tokenize(text: str) -> List[str]:

    normalized = normalize_text(text)

    words = normalized.split()

    return [
        word
        for word in words
        if word not in STOP_WORDS
        and len(word) > 1
    ]


# ============================================================
# FUZZY WORD MATCH
# ============================================================

def fuzzy_word_match(
    query_word: str,
    text_words: List[str],
) -> float:

    if not query_word:
        return 0.0

    # Exact match
    if query_word in text_words:
        return 1.0

    # Prefix / substring match
    for word in text_words:

        if len(query_word) >= 4:

            if (
                word.startswith(query_word)
                or query_word.startswith(word)
            ):
                return 0.90

            if (
                query_word in word
                or word in query_word
            ):
                return 0.82

    # Fuzzy spelling match
    best = 0.0

    for word in text_words:

        if abs(
            len(word) - len(query_word)
        ) > 4:
            continue

        similarity = SequenceMatcher(
            None,
            query_word,
            word,
        ).ratio()

        if similarity > best:
            best = similarity

    if best >= 0.78:
        return best

    return 0.0


# ============================================================
# DOCUMENT EXTRACTION
# ============================================================

def extract_pdf(path: Path) -> str:

    if PdfReader is None:
        raise RuntimeError(
            "pypdf is not installed. Run: pip install pypdf"
        )

    reader = PdfReader(str(path))

    pages = []

    for page in reader.pages:

        try:

            text = page.extract_text() or ""

            if text.strip():
                pages.append(text)

        except Exception:
            continue

    return "\n".join(pages)


def extract_docx(path: Path) -> str:

    if Document is None:
        raise RuntimeError(
            "python-docx is not installed. Run: pip install python-docx"
        )

    document = Document(str(path))

    parts = []

    for paragraph in document.paragraphs:

        text = paragraph.text.strip()

        if text:
            parts.append(text)

    # Also read tables
    for table in document.tables:

        for row in table.rows:

            values = []

            for cell in row.cells:

                text = cell.text.strip()

                if text:
                    values.append(text)

            if values:
                parts.append(
                    " | ".join(values)
                )

    return "\n".join(parts)


def extract_pptx(path: Path) -> str:

    if Presentation is None:
        raise RuntimeError(
            "python-pptx is not installed. Run: pip install python-pptx"
        )

    presentation = Presentation(str(path))

    slides = []

    for slide_number, slide in enumerate(
        presentation.slides,
        start=1,
    ):

        slide_text = [
            f"Slide {slide_number}"
        ]

        for shape in slide.shapes:

            if hasattr(shape, "text"):

                text = shape.text.strip()

                if text:
                    slide_text.append(text)

        if len(slide_text) > 1:

            slides.append(
                "\n".join(slide_text)
            )

    return "\n\n".join(slides)


def extract_xlsx(path: Path) -> str:

    if load_workbook is None:
        raise RuntimeError(
            "openpyxl is not installed. Run: pip install openpyxl"
        )

    workbook = load_workbook(
        filename=str(path),
        read_only=True,
        data_only=True,
    )

    output = []

    for sheet in workbook.worksheets:

        output.append(
            f"Sheet: {sheet.title}"
        )

        for row in sheet.iter_rows(
            values_only=True
        ):

            values = []

            for value in row:

                if value is not None:

                    values.append(
                        str(value)
                    )

            if values:

                output.append(
                    " | ".join(values)
                )

    return "\n".join(output)


def extract_txt(path: Path) -> str:

    encodings = [
        "utf-8",
        "utf-8-sig",
        "latin-1",
    ]

    for encoding in encodings:

        try:

            return path.read_text(
                encoding=encoding
            )

        except UnicodeDecodeError:
            continue

    return ""


# ============================================================
# ZIP EXTRACTION
# ============================================================

def extract_zip(path: Path) -> str:

    allowed_inside = {
        ".txt",
        ".md",
        ".py",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".css",
        ".html",
        ".json",
        ".csv",
        ".sql",
    }

    extracted_parts = []

    try:

        with zipfile.ZipFile(
            path,
            "r",
        ) as archive:

            for member in archive.infolist():

                if member.is_dir():
                    continue

                member_path = Path(
                    member.filename
                )

                extension = (
                    member_path.suffix.lower()
                )

                if extension not in allowed_inside:
                    continue

                if member.file_size > 5 * 1024 * 1024:
                    continue

                try:

                    raw = archive.read(member)

                    text = raw.decode(
                        "utf-8",
                        errors="ignore",
                    )

                    text = clean_text(text)

                    if text:

                        extracted_parts.append(
                            f"File: {member.filename}\n{text}"
                        )

                except Exception:
                    continue

    except Exception as exc:

        raise RuntimeError(
            f"Could not read ZIP file: {exc}"
        )

    return "\n\n".join(
        extracted_parts
    )


def extract_document_text(
    path: Path,
    extension: str,
) -> str:

    extension = extension.lower()

    if extension == ".pdf":
        return extract_pdf(path)

    if extension == ".docx":
        return extract_docx(path)

    if extension == ".pptx":
        return extract_pptx(path)

    if extension == ".xlsx":
        return extract_xlsx(path)

    if extension == ".txt":
        return extract_txt(path)

    if extension == ".zip":
        return extract_zip(path)

    raise ValueError(
        f"Unsupported file type: {extension}"
    )


# ============================================================
# SMART CHUNKING
# ============================================================

def create_chunks(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> List[str]:

    text = clean_text(text)

    if not text:
        return []

    # Convert paragraphs into cleaner blocks.
    paragraphs = re.split(
        r"\n\s*\n",
        text,
    )

    chunks = []

    for paragraph in paragraphs:

        paragraph = paragraph.strip()

        if not paragraph:
            continue

        words = paragraph.split()

        # Small paragraph = one chunk
        if len(words) <= chunk_size:

            chunks.append(
                paragraph
            )

            continue

        start = 0

        while start < len(words):

            end = min(
                start + chunk_size,
                len(words),
            )

            chunk = " ".join(
                words[start:end]
            ).strip()

            if chunk:
                chunks.append(chunk)

            if end >= len(words):
                break

            start = max(
                end - overlap,
                start + 1,
            )

    return chunks


# ============================================================
# SEARCH SCORING
# ============================================================

def calculate_search_score(
    query: str,
    text: str,
) -> float:

    query_normalized = normalize_text(
        query
    )

    text_normalized = normalize_text(
        text
    )

    if not query_normalized:
        return 0.0

    if not text_normalized:
        return 0.0

    query_words = tokenize(query)

    text_words = tokenize(text)

    if not query_words:
        return 0.0

    if not text_words:
        return 0.0

    # --------------------------------------------------------
    # 1. Exact full query
    # --------------------------------------------------------

    exact_score = 0.0

    if query_normalized in text_normalized:
        exact_score = 1.0

    # --------------------------------------------------------
    # 2. Important word matching
    # --------------------------------------------------------

    word_scores = []

    for query_word in query_words:

        score = fuzzy_word_match(
            query_word,
            text_words,
        )

        word_scores.append(score)

    average_word_score = (
        sum(word_scores)
        / len(word_scores)
    )

    # --------------------------------------------------------
    # 3. Coverage
    # --------------------------------------------------------

    matched_words = sum(
        1
        for score in word_scores
        if score >= 0.60
    )

    coverage_score = (
        matched_words
        / len(query_words)
    )

    # --------------------------------------------------------
    # 4. Strong exact matches
    # --------------------------------------------------------

    exact_word_count = 0

    text_word_set = set(text_words)

    for word in query_words:

        if word in text_word_set:
            exact_word_count += 1

    exact_word_score = (
        exact_word_count
        / len(query_words)
    )

    # --------------------------------------------------------
    # 5. Phrase matching
    # --------------------------------------------------------

    phrase_score = 0.0

    if len(query_words) >= 2:

        phrase = " ".join(
            query_words
        )

        if phrase in text_normalized:

            phrase_score = 1.0

        else:

            # Check smaller consecutive phrases
            phrase_parts = []

            for i in range(
                len(query_words) - 1
            ):

                phrase_parts.append(
                    " ".join(
                        query_words[
                            i:i + 2
                        ]
                    )
                )

            matched_phrases = sum(
                1
                for phrase_part in phrase_parts
                if phrase_part in text_normalized
            )

            if phrase_parts:

                phrase_score = (
                    matched_phrases
                    / len(phrase_parts)
                )

    # --------------------------------------------------------
    # 6. Query term presence
    # --------------------------------------------------------

    presence_score = 0.0

    for word in query_words:

        if word in text_normalized:
            presence_score += 1

    presence_score /= len(
        query_words
    )

    # --------------------------------------------------------
    # FINAL SCORE
    # --------------------------------------------------------

    score = (
        average_word_score * 0.35
        + coverage_score * 0.30
        + exact_word_score * 0.15
        + phrase_score * 0.10
        + exact_score * 0.10
    )

    # Boost if multiple query terms are
    # actually present.
    if presence_score >= 0.5:
        score += 0.08

    if presence_score >= 0.8:
        score += 0.08

    return round(
        min(
            max(score, 0.0),
            1.0,
        ),
        4,
    )


# ============================================================
# SEARCH SNIPPET
# ============================================================

def create_search_snippet(
    text: str,
    query: str,
    max_length: int = 700,
) -> str:

    text = clean_text(text)

    if len(text) <= max_length:
        return text

    query_words = tokenize(query)

    lower_text = text.lower()

    positions = []

    for word in query_words:

        position = lower_text.find(
            word.lower()
        )

        if position >= 0:
            positions.append(position)

    if positions:

        best_position = min(
            positions
        )

        start = max(
            0,
            best_position - 180,
        )

    else:

        start = 0

    end = min(
        start + max_length,
        len(text),
    )

    snippet = text[
        start:end
    ].strip()

    if start > 0:
        snippet = "..." + snippet

    if end < len(text):
        snippet += "..."

    return snippet


# ============================================================
# SEARCH DOCUMENTS
# ============================================================

def search_documents(
    query: str,
) -> List[Dict[str, Any]]:

    documents = load_documents()

    query = query.strip()

    if not query:
        return []

    results = []

    for document in documents:

        filename = document.get(
            "filename",
            "Document",
        )

        extension = document.get(
            "extension",
            "",
        )

        chunks = document.get(
            "chunks_data",
            [],
        )

        # ----------------------------------------------------
        # OLD DATA SUPPORT
        # ----------------------------------------------------

        if not chunks:

            stored_text = document.get(
                "text",
                "",
            )

            if stored_text:

                chunks = [
                    {
                        "index": index,
                        "text": chunk,
                    }
                    for index, chunk in enumerate(
                        create_chunks(
                            stored_text
                        )
                    )
                ]

        # ----------------------------------------------------
        # SCORE EVERY CHUNK
        # ----------------------------------------------------

        document_results = []

        for chunk_index, chunk in enumerate(
            chunks
        ):

            if isinstance(
                chunk,
                dict,
            ):

                chunk_text = chunk.get(
                    "text",
                    "",
                )

                actual_index = chunk.get(
                    "index",
                    chunk_index,
                )

            else:

                chunk_text = str(chunk)
                actual_index = chunk_index

            if not chunk_text.strip():
                continue

            score = calculate_search_score(
                query,
                chunk_text,
            )

            if score < MIN_SEARCH_SCORE:
                continue

            document_results.append(
                {
                    "id": document.get(
                        "id"
                    ),
                    "filename": filename,
                    "extension": extension,
                    "text": create_search_snippet(
                        chunk_text,
                        query,
                    ),
                    "score": score,
                    "chunk_index": actual_index,
                }
            )

        # Keep strongest chunks from each document
        document_results.sort(
            key=lambda x: x["score"],
            reverse=True,
        )

        results.extend(
            document_results[
                :MAX_RESULTS_PER_DOCUMENT
            ]
        )

    # ========================================================
    # SORT GLOBAL RESULTS
    # ========================================================

    results.sort(
        key=lambda x: x.get(
            "score",
            0,
        ),
        reverse=True,
    )

    # ========================================================
    # DUPLICATE REMOVAL
    # ========================================================

    unique_results = []

    seen = set()

    for result in results:

        key = (
            result.get(
                "filename",
                "",
            ),
            normalize_text(
                result.get(
                    "text",
                    "",
                )
            )[:350],
        )

        if key in seen:
            continue

        seen.add(key)

        unique_results.append(
            result
        )

    # ========================================================
    # FINAL LIMIT
    # ========================================================

    return unique_results[
        :MAX_SEARCH_RESULTS
    ]


# ============================================================
# GEMINI CLIENT
# ============================================================

GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY",
    "",
)

gemini_client = None

if genai and GEMINI_API_KEY:

    try:

        gemini_client = genai.Client(
            api_key=GEMINI_API_KEY
        )

        print(
            "✓ Gemini client initialized"
        )

    except Exception as exc:

        print(
            "Gemini initialization failed:",
            exc,
        )


# ============================================================
# BUILD AI CONTEXT
# ============================================================

def build_context(
    question: str,
) -> List[Dict[str, Any]]:

    results = search_documents(
        question
    )

    return results


# ============================================================
# FALLBACK ANSWER
# ============================================================

def fallback_answer(
    question: str,
    results: List[Dict[str, Any]],
) -> str:

    if not results:

        return (
            "I couldn't find a sufficiently relevant "
            "section for this question in the uploaded documents."
        )

    best_results = results[:3]

    parts = []

    for result in best_results:

        filename = result.get(
            "filename",
            "document",
        )

        text = result.get(
            "text",
            "",
        )

        parts.append(
            f"From {filename}:\n{text}"
        )

    return "\n\n".join(parts)


# ============================================================
# AI ANSWER
# ============================================================

def generate_answer(
    question: str,
    results: List[Dict[str, Any]],
) -> str:

    if not results:

        return (
            "I couldn't find a sufficiently relevant "
            "section for this question in the uploaded documents."
        )

    # --------------------------------------------------------
    # IMPORTANT:
    # Only send top relevant chunks.
    # --------------------------------------------------------

    context_parts = []

    for index, result in enumerate(
        results[:6],
        start=1,
    ):

        filename = result.get(
            "filename",
            "Document",
        )

        text = result.get(
            "text",
            "",
        )

        score = result.get(
            "score",
            0,
        )

        context_parts.append(
            f"""
SOURCE {index}
FILE: {filename}
RELEVANCE SCORE: {score}

CONTENT:
{text}
"""
        )

    context = "\n".join(
        context_parts
    )

    # --------------------------------------------------------
    # GEMINI
    # --------------------------------------------------------

    if gemini_client:

        prompt = f"""
You are DocuMind AI.

You answer questions using uploaded documents.

IMPORTANT RULES:

1. Answer ONLY from the supplied document context.
2. Do NOT use outside knowledge.
3. Do NOT dump all document content.
4. Answer ONLY the part relevant to the user's question.
5. If the user asks for a specific item, give that specific item.
6. If the answer appears in multiple sources, combine only the relevant information.
7. Do not mention relevance scores.
8. Do not say "I couldn't find" if the supplied context contains information that can reasonably answer the question.
9. If the context genuinely does not contain the answer, say:
   "That information is not available in the uploaded documents."
10. Keep the answer concise and direct.
11. If the document contains a list, table, steps, definition, name, number, date, or specific value requested by the user, return that exact relevant information.
12. Never summarize the entire document when the user asks about one specific topic.

USER QUESTION:
{question}

RELEVANT DOCUMENT CONTEXT:
{context}

Now answer the user's question directly.
"""

        try:

            response = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )

            answer = getattr(
                response,
                "text",
                None,
            )

            if answer:

                return answer.strip()

        except Exception as exc:

            print(
                "Gemini error:",
                exc,
            )

    # --------------------------------------------------------
    # FALLBACK
    # --------------------------------------------------------

    return fallback_answer(
        question,
        results,
    )


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "name": "DocuMind AI",
        "status": "online",
        "version": "3.0.0",
    }


# ============================================================
# STATUS
# ============================================================

@app.get("/status")
def status():

    documents = load_documents()

    return {
        "ready": True,
        "indexed_files": len(
            documents
        ),
        "supported_extensions": list(
            SUPPORTED_EXTENSIONS
        ),
    }


# ============================================================
# GET DOCUMENTS
# ============================================================

@app.get("/documents")
def get_documents():

    documents = load_documents()

    output = []

    for document in documents:

        chunks = document.get(
            "chunks_data",
            [],
        )

        output.append(
            {
                "id": document.get(
                    "id"
                ),
                "filename": document.get(
                    "filename"
                ),
                "extension": document.get(
                    "extension"
                ),
                "size": document.get(
                    "size",
                    0,
                ),
                "chunks": len(chunks),
                "created_at": document.get(
                    "created_at"
                ),
            }
        )

    return {
        "documents": output
    }


# ============================================================
# UPLOAD
# ============================================================

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="No filename provided.",
        )

    original_filename = Path(
        file.filename
    ).name

    extension = Path(
        original_filename
    ).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:

        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported format. "
                "Use PDF, DOCX, PPTX, XLSX, TXT or ZIP."
            ),
        )

    # ========================================================
    # READ FILE
    # ========================================================

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:

        raise HTTPException(
            status_code=400,
            detail="Maximum file size is 20 MB.",
        )

    # ========================================================
    # CREATE ID
    # ========================================================

    document_id = str(
        uuid.uuid4()
    )

    file_path = (
        UPLOAD_DIR
        / f"{document_id}{extension}"
    )

    # ========================================================
    # SAVE
    # ========================================================

    try:

        with open(
            file_path,
            "wb",
        ) as buffer:

            buffer.write(content)

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=f"Could not save file: {exc}",
        )

    # ========================================================
    # EXTRACT
    # ========================================================

    try:

        extracted_text = extract_document_text(
            file_path,
            extension,
        )

        extracted_text = clean_text(
            extracted_text
        )

    except Exception as exc:

        try:
            file_path.unlink()
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail=f"Could not read document: {exc}",
        )

    if not extracted_text:

        try:
            file_path.unlink()
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text was found in this document."
            ),
        )

    # ========================================================
    # CREATE SMART CHUNKS
    # ========================================================

    chunks = create_chunks(
        extracted_text
    )

    if not chunks:

        raise HTTPException(
            status_code=400,
            detail=(
                "Could not create searchable chunks."
            ),
        )

    # ========================================================
    # CREATE DOCUMENT RECORD
    # ========================================================

    document = {
        "id": document_id,
        "filename": original_filename,
        "extension": extension,
        "size": len(content),
        "created_at": datetime.now().isoformat(),

        "text": extracted_text,

        "chunks_data": [
            {
                "index": index,
                "text": chunk,
            }
            for index, chunk in enumerate(
                chunks
            )
        ],
    }

    # ========================================================
    # SAVE
    # ========================================================

    documents = load_documents()

    documents.append(
        document
    )

    save_documents(
        documents
    )

    return {
        "success": True,
        "message": (
            "Document uploaded and indexed successfully."
        ),
        "document": {
            "id": document_id,
            "filename": original_filename,
            "extension": extension,
            "size": len(content),
            "chunks": len(chunks),
        },
    }


# ============================================================
# DELETE DOCUMENT
# ============================================================

@app.delete(
    "/documents/{document_id}"
)
def delete_document(
    document_id: str,
):

    documents = load_documents()

    document = next(
        (
            doc
            for doc in documents
            if doc.get("id") == document_id
        ),
        None,
    )

    if document is None:

        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    extension = document.get(
        "extension",
        "",
    )

    file_path = (
        UPLOAD_DIR
        / f"{document_id}{extension}"
    )

    if file_path.exists():

        try:

            file_path.unlink()

        except Exception as exc:

            print(
                "Could not delete physical file:",
                exc,
            )

    documents = [
        doc
        for doc in documents
        if doc.get("id") != document_id
    ]

    save_documents(
        documents
    )

    return {
        "success": True,
        "message": "Document deleted successfully.",
    }


# ============================================================
# SEARCH
# ============================================================

@app.post("/search")
def search_documents_endpoint(
    request: SearchRequest,
):

    query = request.query.strip()

    if not query:

        return {
            "query": "",
            "results": [],
            "count": 0,
        }

    results = search_documents(
        query
    )

    return {
        "query": query,
        "results": results,
        "count": len(results),
    }


# ============================================================
# ASK AI
# ============================================================

@app.post("/ask")
def ask_document(
    request: AskRequest,
):

    question = request.question.strip()

    if not question:

        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    documents = load_documents()

    if not documents:

        raise HTTPException(
            status_code=400,
            detail="Please upload a document first.",
        )

    # ========================================================
    # SEARCH
    # ========================================================

    relevant_results = build_context(
        question
    )

    # ========================================================
    # GENERATE ANSWER
    # ========================================================

    answer = generate_answer(
        question,
        relevant_results,
    )

    # ========================================================
    # SOURCES
    # ========================================================

    sources = []

    seen_sources = set()

    for result in relevant_results:

        filename = result.get(
            "filename",
            "Document",
        )

        if filename in seen_sources:
            continue

        seen_sources.add(
            filename
        )

        sources.append(
            filename
        )

    return {
        "question": question,
        "answer": answer,
        "sources": sources,
        "results": relevant_results,
    }


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )