# Backend test suite map

One line per file, grouped by module. Names are module-based (the
`test_phaseN_*` naming was retired in test-slim Phase 3 — see
`the TEST_SLIM_ORDER_2026-06-12 plan (repo history)`). `dormant/` holds
spec-by-test files for v0.2 features that are declared but not yet
enforced (state machine); they are excluded from CI collection.

## Golden loop / assistant

- `test_assistant_pipeline.py` — chat → tool call → skill run pipeline, parse-failure fallback, tool-error path, empty registry
- `test_smoke_evals.py` — deterministic smoke evals over the assistant surface
- `test_agent_evals.py` — agent-kit-style eval harness cases
- `test_demo_loop.py` — seeded demo walkthrough (Khan matter)

## Matters

- `test_matters_routes.py` — matter CRUD routes
- `test_matter_context.py` — matter context primitive
- `test_matter_close.py` — archive (DELETE) cascade: matter-scoped grants revoked, legacy/other-matter grants survive, `module.grant.revoked` audited
- `test_lmf_close_and_export_audit.py` — non-destructive close (status=closed, idempotent, audited) + export-download audit
- `test_matter_delete.py` — destructive delete tombstone
- `test_archived_matter_access.py` — archived matters are 404 across surfaces
- `test_matter_required_provider.py` — provider-key requirement per matter
- `test_account_delete.py` — account deletion semantics

## Documents / storage / export

- `test_documents_routes.py` — document upload/list/read routes
- `test_document_engine.py` — document engine (extraction etc.)
- `test_upload_validation.py` — upload validation
- `test_original_file_retrieval.py` — original file retrieval
- `test_storage.py` — storage backend contract
- `test_storage_failure_envelopes.py` — structured errors on storage failure
- `test_storage_minio_smoke.py` — MinIO/S3 smoke (separate CI job)
- `test_export.py` / `test_export_completeness.py` — matter export build + completeness
- `test_export_after_delete.py` — export survives content deletion rules
- `test_export_signoff_gating.py` — export gated on sign-off
- `test_export_source_anchors.py` / `test_export_working_pack.py` — anchors + working pack in export
- `test_anonymisation_optional.py` — optional anonymisation pass

## Audit (governance — reorganise, never thin)

- `test_audit_chain.py` / `test_audit_chain_endpoint.py` — hash-chain integrity + verification endpoint
- `test_audit_worm.py` / `test_audit_worm_role_split.py` — WORM triggers + role split on audit table
- `test_audit_route.py` — audit listing route
- `test_audit_cost.py` — model-invoked cost columns + helper
- `test_audit_reconstruction.py` — reconstruction core merge, cursors/pagination (incl. R2 no-row-dropped regression), invocation_id/action filters before pagination, matter API access + viewed-row emission
- `test_audit_coverage.py` — audit gap-fill: every auth/settings/module lifecycle event emits its canonical row (see `docs/spec/AUDIT_COVERAGE_MATRIX.md`)
- `test_provider_audit_completeness.py` — gateway failure paths (key missing, upstream subcodes) audit-before-raise
- `test_audit_module_kwarg.py` — module kwarg propagation on audit rows
- `test_seed_audit.py` — seeding emits audit rows

## Admin / auth / users

- `test_admin_api.py` — admin role change, user listing/detail (DTO leak guard), workspace-scoped reconstruction endpoint; one non-admin-403 per route
- `test_bootstrap_admin.py` — bootstrap-admin CLI exit codes + `/api/system/bootstrap-state` endpoint
- `test_auth_login.py` — login flow
- `test_user_plan.py` — user plan/limits surface
- `test_route_acl_sweep.py` — every route swept for auth/ACL coverage (governance)

## Modules / registry / install (plugin substrate)

- `test_registry.py` / `test_registry_validator.py` — module registry + manifest validation
- `test_modules_api.py` — module listing/detail API
- `test_module_install_api.py` — install ceremony API (start/advance/grant)
- `test_module_validate_endpoint.py` — manifest validate endpoint
- `test_module_requests.py` — module request flow
- `test_trust_ceremony.py` — trust ceremony state machine
- `test_publishers.py` — publisher identity/verification
- `test_signing.py` / `test_signing_ed25519.py` — manifest signing + ed25519 primitives
- `test_sandbox.py` — module sandbox isolation
- `test_mcp_host.py` — MCP host bridge
- `test_dependency_resolver.py` — module dependency resolution
- `test_doctor.py` — `doctor.check_manifests_valid` raising contract
- `test_lawve_import.py` / `test_lawve_directory.py` — Lawve catalogue import + directory
- `test_github_import.py` — GitHub-repo module import at pinned SHA
- `test_workspace_skills.py` — workspace skill shelf

## Grants / capabilities / posture (governance)

- `test_grants_api.py` — matter grants API
- `test_grants_lifecycle.py` — grant create/revoke/update lifecycle
- `test_grant_scope_schema.py` — grant scope schema + migration shape
- `test_capabilities.py` — capability enforcement
- `test_capability_vocabulary_schema.py` — capability vocabulary schema
- `test_declared_capabilities_resolver.py` — declared-capability resolution
- `test_posture_gate.py` — privilege posture gate (A_cleared/B_mixed/C_paused)
- `test_advice_boundary.py` — advice-boundary tier decisions

## Runtime / invocations / model gateway

- `test_runtime.py` — module runtime execution
- `test_invocations_api.py` — `/invocations` API
- `test_prompt_runtime.py` / `test_prompt_runtime_anchors.py` / `test_prompt_runtime_extracted_body.py` — prompt runtime + source anchors + body extraction
- `test_source_anchors.py` — source anchor substrate
- `test_gateway_fallback.py` — model gateway fallback rules (no server keys in prod)
- `test_provider_upstream_errors.py` — upstream error envelope mapping
- `test_key_rotation.py` / `test_key_rotation_smoke.py` — encryption key rotation
- `test_matter_artifacts.py` — write_artifact substrate (WORM, uniqueness) + artifact list/read API
- `test_artifact_legacy_unavailable.py` — legacy artifact 410 envelope

## Sign-off / review (governance)

- `test_signoff_api.py` — output sign-off API (signer-is-author rule)
- `test_supervisor_review_api.py` / `test_supervisor_review_substrate.py` — supervisor review surface + substrate
- `test_pending_edits_endpoint.py` — pending edits endpoint

## Infra / misc

- `test_jobs.py` — background job lifecycle
- `test_worker_smoke.py` — worker smoke (separate CI job)
- `test_observability.py` — logging/metrics surface
- `test_limits.py` — rate/size limits
- `test_migration_discipline.py` — alembic migration hygiene
- `test_chronology_smoke.py` — chronology smoke

## dormant/ (excluded from CI)

- `dormant/test_state_machine.py`, `dormant/test_state_machine_api_security.py`, `dormant/test_state_machine_integration.py` — v0.2 spec-by-test for the state-machine primitive (declared, not yet enforced); each carries a header naming the roadmap item that revives it
