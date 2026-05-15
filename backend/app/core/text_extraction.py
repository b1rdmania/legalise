"""Document text extraction pipeline.

Dispatches by mime-type / magic bytes and returns a uniform `ExtractResult`
regardless of the underlying library outcome. The caller persists this as
a `DocumentBody` row.

Rules (see PHASE_A_DELTA.md Workstream 1):
- PDF: try `pypdf`. If text < 100 chars AND size > 50_000, retry with
  `pdfplumber`. If still < 100 chars on a > 50KB PDF, classify as scanned.
- Encrypted PDFs raise on `pypdf` → classify as `failed` with
  `error_reason='encrypted'`.
- DOCX: `python-docx`, join paragraphs with `\n\n`.
- TXT/MD: utf-8 decode with `errors='replace'`.
- Unknown: `failed` with `error_reason='unsupported_mime'`.

Mime sniffing: trust magic bytes over the user-supplied `mime_type`
header (UploadFile.content_type is user-controlled).
"""

from __future__ import annotations

import io
from typing import Literal

from pydantic import BaseModel


ExtractionMethod = Literal["pypdf", "pdfplumber", "python-docx", "passthrough", "failed"]


class ExtractResult(BaseModel):
    extracted_text: str
    extraction_method: ExtractionMethod
    char_count: int
    page_count: int | None = None
    error_reason: str | None = None


# Magic-byte / sniffing thresholds
_PDF_MAGIC = b"%PDF-"
_ZIP_MAGIC = b"PK\x03\x04"  # DOCX is a zip
_MIN_TEXT_CHARS = 100
_MIN_SIZE_FOR_SCAN_CHECK = 50_000


def _sniff_kind(file_bytes: bytes, mime_type: str, filename: str) -> str:
    """Return one of: 'pdf', 'docx', 'text', 'unknown'."""
    head = file_bytes[:8]
    name_lc = (filename or "").lower()

    if head.startswith(_PDF_MAGIC):
        return "pdf"
    if head.startswith(_ZIP_MAGIC) and name_lc.endswith(".docx"):
        return "docx"

    mt = (mime_type or "").lower()
    if mt == "application/pdf" or name_lc.endswith(".pdf"):
        return "pdf"
    if (
        mt == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or name_lc.endswith(".docx")
    ):
        return "docx"
    if (
        mt.startswith("text/")
        or mt == "application/x-markdown"
        or name_lc.endswith(".txt")
        or name_lc.endswith(".md")
    ):
        return "text"
    return "unknown"


def _extract_pdf_pypdf(file_bytes: bytes) -> tuple[str, int | None, str | None]:
    """Return (text, page_count, error_reason). error_reason set on encrypted PDFs."""
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        if getattr(reader, "is_encrypted", False):
            return "", None, "encrypted"
        parts: list[str] = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001 — per-page extraction failure shouldn't kill the doc
                continue
        return "\n\n".join(parts).strip(), len(reader.pages), None
    except PdfReadError as exc:
        msg = str(exc).lower()
        if "encrypt" in msg or "password" in msg:
            return "", None, "encrypted"
        return "", None, "pdf_read_error"
    except Exception:  # noqa: BLE001
        return "", None, "pdf_read_error"


def _extract_pdf_pdfplumber(file_bytes: bytes) -> tuple[str, int | None]:
    try:
        import pdfplumber
    except ImportError:
        return "", None
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            parts: list[str] = []
            for page in pdf.pages:
                try:
                    parts.append(page.extract_text() or "")
                except Exception:  # noqa: BLE001
                    continue
            return "\n\n".join(parts).strip(), len(pdf.pages)
    except Exception:  # noqa: BLE001
        return "", None


def _extract_docx(file_bytes: bytes) -> str:
    from docx import Document as _DocxDocument

    doc = _DocxDocument(io.BytesIO(file_bytes))
    return "\n\n".join(p.text for p in doc.paragraphs).strip()


def extract(file_bytes: bytes, mime_type: str, filename: str) -> ExtractResult:
    """Extract text from `file_bytes`. Never raises; always returns a result."""
    size = len(file_bytes)
    kind = _sniff_kind(file_bytes, mime_type, filename)

    if kind == "pdf":
        text, page_count, err = _extract_pdf_pypdf(file_bytes)
        if err == "encrypted":
            return ExtractResult(
                extracted_text="",
                extraction_method="failed",
                char_count=0,
                page_count=page_count,
                error_reason="encrypted",
            )

        method: ExtractionMethod = "pypdf"
        if len(text) < _MIN_TEXT_CHARS and size > _MIN_SIZE_FOR_SCAN_CHECK:
            pp_text, pp_pages = _extract_pdf_pdfplumber(file_bytes)
            if len(pp_text) >= _MIN_TEXT_CHARS:
                text = pp_text
                page_count = pp_pages if pp_pages is not None else page_count
                method = "pdfplumber"
            else:
                return ExtractResult(
                    extracted_text="",
                    extraction_method="failed",
                    char_count=0,
                    page_count=page_count,
                    error_reason="scanned_pdf",
                )

        if not text and err:
            return ExtractResult(
                extracted_text="",
                extraction_method="failed",
                char_count=0,
                page_count=page_count,
                error_reason=err,
            )

        return ExtractResult(
            extracted_text=text,
            extraction_method=method,
            char_count=len(text),
            page_count=page_count,
        )

    if kind == "docx":
        try:
            text = _extract_docx(file_bytes)
        except Exception:  # noqa: BLE001
            return ExtractResult(
                extracted_text="",
                extraction_method="failed",
                char_count=0,
                page_count=None,
                error_reason="docx_read_error",
            )
        return ExtractResult(
            extracted_text=text,
            extraction_method="python-docx",
            char_count=len(text),
            page_count=None,
        )

    if kind == "text":
        text = file_bytes.decode("utf-8", errors="replace").strip()
        return ExtractResult(
            extracted_text=text,
            extraction_method="passthrough",
            char_count=len(text),
            page_count=None,
        )

    return ExtractResult(
        extracted_text="",
        extraction_method="failed",
        char_count=0,
        page_count=None,
        error_reason="unsupported_mime",
    )
