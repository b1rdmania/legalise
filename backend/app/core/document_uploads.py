"""Shared document-upload validation.

Both first uploads and replacement-version uploads accept the same file
formats and enforce the same size / magic-byte checks. Keep that policy out
of route modules so the document engine does not drift by endpoint.
"""

from __future__ import annotations

from fastapi import HTTPException

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


def validate_upload_mime(content_type: str | None) -> None:
    if content_type not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(
            415,
            detail={
                "error": "unsupported_mime",
                "got": content_type,
                "allowed": sorted(ALLOWED_UPLOAD_MIMES),
            },
        )


def validate_upload_size(contents: bytes) -> None:
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            detail={
                "error": "upload_too_large",
                "max_bytes": MAX_UPLOAD_BYTES,
                "got_bytes": len(contents),
            },
        )


def validate_upload_magic_bytes(content_type: str | None, contents: bytes) -> None:
    declared_format = MIME_TO_FORMAT[content_type or ""]
    inferred_format = sniff_format(contents[:1024])
    if inferred_format is None or declared_format != inferred_format:
        raise HTTPException(
            415,
            detail={
                "error": "magic_byte_mismatch",
                "declared_mime": content_type,
                "declared_format": declared_format,
                "inferred_format": inferred_format,
            },
        )
