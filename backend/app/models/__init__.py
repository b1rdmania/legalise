"""SQLAlchemy models for Legalise.

Real models land Week 1 Day 2. This file is the contract surface for the schema:

- User: id, email, name, role (solicitor | paralegal | client | external)
- Matter: id, slug, title, status, case_theory, pivot_fact, privilege_posture,
    default_model_id, opened_at, closed_at, retention_until, created_by_id
- Document: id, matter_id, filename, mime_type, size_bytes, sha256, storage_uri,
    from_disclosure, disclosure_proceedings_ref, uploaded_at, uploaded_by_id
- Event: id, matter_id, date, description, significance, source_doc_ids,
    priv_flag, created_at
- AuditEntry: id, actor_id, matter_id, action, resource_type, resource_id,
    prompt_hash, response_hash, model_used, token_count, latency_ms, metadata, timestamp
- PluginInvocation: id, audit_entry_id, plugin_name, skill_name, inputs, outputs, status

See ARCHITECTURE.md for the full data model.
"""
