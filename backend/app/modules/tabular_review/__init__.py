"""Tabular review module — spreadsheet-style cross-document review.

Uses the `tabular_reviews` / `tabular_review_rows` tables. No schema
migration required; rows are lazily upserted on first cell write.
"""

__all__: list[str] = []
