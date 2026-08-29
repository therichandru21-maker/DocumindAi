"""
Embedding service for DocuMind AI.

Phase 3:
- Converts text chunks into vector embeddings
- Uses Sentence Transformers
"""

from sentence_transformers import SentenceTransformer


class EmbeddingService:
    """
    Generate semantic embeddings using
    a Sentence Transformer model.
    """

    def __init__(
        self,
        model_name: str = "all-MiniLM-L6-v2",
    ):
        self.model_name = model_name

        self.model = SentenceTransformer(
            self.model_name
        )

    def embed_text(
        self,
        text: str,
    ) -> list[float]:
        """
        Generate an embedding for a single text.
        """

        if not text or not text.strip():
            raise ValueError(
                "Text cannot be empty."
            )

        embedding = self.model.encode(
            text,
            normalize_embeddings=True,
        )

        return embedding.tolist()

    def embed_documents(
        self,
        texts: list[str],
    ):
        """
        Generate embeddings for multiple documents.
        """

        if not texts:
            return []

        embeddings = self.model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        return embeddings