"""
FAISS vector store for DocuMind AI.

Phase 3:
- Stores document embeddings
- Performs similarity search
- Preserves source metadata
"""

import json
from pathlib import Path

import faiss
import numpy as np


class FAISSVectorStore:
    """
    FAISS-based vector database.
    """

    def __init__(
        self,
        storage_dir: Path,
        dimension: int = 384,
    ):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        self.dimension = dimension

        self.index_path = (
            self.storage_dir / "documents.index"
        )

        self.metadata_path = (
            self.storage_dir / "metadata.json"
        )

        self.index = None
        self.metadata = []

        self._load()

    # --------------------------------------------------
    # Load Existing Index
    # --------------------------------------------------

    def _load(self):
        """
        Load existing FAISS index and metadata.
        """

        if self.index_path.exists():
            self.index = faiss.read_index(
                str(self.index_path)
            )
        else:
            self.index = faiss.IndexFlatIP(
                self.dimension
            )

        if self.metadata_path.exists():
            with self.metadata_path.open(
                "r",
                encoding="utf-8",
            ) as file:
                self.metadata = json.load(file)
        else:
            self.metadata = []

    # --------------------------------------------------
    # Save Index
    # --------------------------------------------------

    def _save(self):
        """
        Persist FAISS index and metadata.
        """

        faiss.write_index(
            self.index,
            str(self.index_path),
        )

        with self.metadata_path.open(
            "w",
            encoding="utf-8",
        ) as file:
            json.dump(
                self.metadata,
                file,
                indent=2,
                ensure_ascii=False,
            )

    # --------------------------------------------------
    # Add Documents
    # --------------------------------------------------

    def add_documents(
        self,
        embeddings,
        documents: list[dict],
    ):
        """
        Add document embeddings and metadata.
        """

        if len(embeddings) != len(documents):
            raise ValueError(
                "Number of embeddings must match "
                "number of documents."
            )

        if not embeddings:
            return

        vectors = np.asarray(
            embeddings,
            dtype="float32",
        )

        if vectors.ndim != 2:
            raise ValueError(
                "Embeddings must be a 2D array."
            )

        if vectors.shape[1] != self.dimension:
            raise ValueError(
                f"Expected embedding dimension "
                f"{self.dimension}, got "
                f"{vectors.shape[1]}."
            )

        self.index.add(vectors)

        self.metadata.extend(documents)

        self._save()

    # --------------------------------------------------
    # Search
    # --------------------------------------------------

    def search(
        self,
        query_embedding,
        top_k: int = 5,
    ) -> list[dict]:
        """
        Search for the most relevant documents.
        """

        if self.index.ntotal == 0:
            return []

        query_vector = np.asarray(
            [query_embedding],
            dtype="float32",
        )

        scores, indices = self.index.search(
            query_vector,
            min(top_k, self.index.ntotal),
        )

        results = []

        for score, index in zip(
            scores[0],
            indices[0],
        ):
            if index < 0:
                continue

            if index >= len(self.metadata):
                continue

            result = {
                **self.metadata[index],
                "similarity_score": float(score),
            }

            results.append(result)

        return results

    # --------------------------------------------------
    # Stats
    # --------------------------------------------------

    def count(self) -> int:
        """
        Return number of vectors stored.
        """

        return self.index.ntotal

    # --------------------------------------------------
    # Clear
    # --------------------------------------------------

    def clear(self):
        """
        Delete all vectors and metadata.
        """

        self.index = faiss.IndexFlatIP(
            self.dimension
        )

        self.metadata = []

        self._save()