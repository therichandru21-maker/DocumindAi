"""
Text chunking service.
"""


class TextSplitter:
    """Split document text into manageable chunks."""

    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ):
        if chunk_size <= 0:
            raise ValueError(
                "chunk_size must be greater than 0"
            )

        if chunk_overlap < 0:
            raise ValueError(
                "chunk_overlap cannot be negative"
            )

        if chunk_overlap >= chunk_size:
            raise ValueError(
                "chunk_overlap must be smaller than chunk_size"
            )

        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks."""

        text = text.strip()

        if not text:
            return []

        chunks = []
        start = 0

        while start < len(text):
            end = start + self.chunk_size

            chunk = text[start:end].strip()

            if chunk:
                chunks.append(chunk)

            if end >= len(text):
                break

            start = end - self.chunk_overlap

        return chunks

    def split_pages(
        self,
        pages: list[dict],
    ) -> list[dict]:
        """
        Split pages while preserving source page numbers.
        """

        chunks = []

        chunk_id = 1

        for page in pages:
            page_number = page["page"]
            text = page["text"]

            page_chunks = self.split_text(text)

            for chunk in page_chunks:
                chunks.append(
                    {
                        "chunk_id": chunk_id,
                        "page": page_number,
                        "text": chunk,
                    }
                )

                chunk_id += 1

        return chunks