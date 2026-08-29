"""
Document loading and text extraction service.
"""

from pathlib import Path

from pypdf import PdfReader


class DocumentLoader:
    """Load supported documents and extract their text."""

    @staticmethod
    def load_pdf(file_path: Path) -> list[dict]:
        """
        Extract text from every page of a PDF.

        Returns:
            A list containing page number and extracted text.
        """

        try:
            reader = PdfReader(str(file_path))

            pages = []

            for page_number, page in enumerate(reader.pages, start=1):
                text = page.extract_text() or ""

                text = text.strip()

                if text:
                    pages.append(
                        {
                            "page": page_number,
                            "text": text,
                        }
                    )

            return pages

        except Exception as exc:
            raise RuntimeError(
                f"Failed to extract PDF text: {exc}"
            ) from exc