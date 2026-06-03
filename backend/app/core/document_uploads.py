"""Shared document-upload validation.

Both first uploads and replacement-version uploads accept the same file
formats and enforce the same size / magic-byte checks. Keep that policy out
of route modules so the document engine does not drift by endpoint.
"""

from __future__ import annotations

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

# Declared MIME -> canonical format key. The format key is what callers compare
# against the inferred-from-bytes format below.
MIME_TO_FORMAT: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "text",
    "text/markdown": "text",
    "application/rtf": "rtf",
    "text/rtf": "rtf",
}
ALLOWED_UPLOAD_MIMES = frozenset(MIME_TO_FORMAT.keys())


def sniff_format(head: bytes) -> str | None:
    """Infer canonical format key from the first ~1KB of a file body."""
    if head.startswith(b"%PDF-"):
        return "pdf"
    if head.startswith(b"PK\x03\x04"):
        return "docx"
    if head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "doc"
    if head.startswith(b"{\\rtf"):
        return "rtf"
    try:
        head.decode("utf-8")
        return "text"
    except UnicodeDecodeError:
        return None

