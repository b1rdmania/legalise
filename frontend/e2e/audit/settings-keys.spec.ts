/**
 * Phase 15 C — settings/keys audit coverage.
 *
 * Covers (from AUDIT_COVERAGE_MATRIX.md):
 *   - user.key.configured (added)
 *   - user.key.configured (rotated)
 *   - user.key.revoked
 *   - GET /api/settings/keys (NONE)
 *
 * The audit map row references `app/api/settings.py:83` for the add/
 * rotate emit + `:122` for the revoke. These rows land at WORKSPACE
 * scope (matter_id IS NULL) because key operations are user-scoped
 * not matter-scoped. Reading via /api/admin/audit/reconstruction
 * (Phase 14.5 C) requires a superuser session — the test bootstraps
 * its user via the real Phase 12 CLI to get one.
 *
 * Phase 13b D pins the key bytes never appearing in any audit
 * payload; this e2e regression asserts the same on the row read
 * back from the substrate.
 */

import { test, expect } from "@playwright/test";
import { resetDb } from "../fixtures/db";
import {
  bootstrapAdminViaCli,
  registerUser,
  signIn,
  signInViaUi,
} from "../fixtures/auth";
import {
  readWorkspaceReconstruction,
  expectWorkspaceAuditRow,
} from "../fixtures/api";

const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";

test.beforeEach(async () => {
  await resetDb();
});

test("settings/keys emits user.key.configured (added) without leaking the key bytes", async ({
  page,
  request,
}) => {
  const user = await registerUser(request, "p15c-keys-add");
  // user.key.configured lands at workspace scope; reading it
  // requires superuser. Promote via the real Phase 12 CLI.
  await bootstrapAdminViaCli(user.email);
  await signIn(request, user);
  await signInViaUi(page, user);

  // POST a key via the real settings endpoint.
  const apiKey = "sk-test-12345678";
  const resp = await request.post(`${BACKEND}/api/settings/keys`, {
    data: { provider: "anthropic", api_key: apiKey },
  });
  expect(resp.status()).toBe(201);

  // Substrate audit row lands with payload.action="added" and the
  // key bytes never appear. Workspace scope per Phase 14.5 A
  // unified payload shape.
  const row = await expectWorkspaceAuditRow(request, "user.key.configured");
  expect(row.payload.action).toBe("added");
  expect(row.payload.provider).toBe("anthropic");
  const payloadJson = JSON.stringify(row.payload);
  expect(payloadJson).not.toContain(apiKey);
  expect(payloadJson).not.toContain("sk-test");
});

test("repeating POST emits user.key.configured (rotated)", async ({
  page,
  request,
}) => {
  const user = await registerUser(request, "p15c-keys-rot");
  await bootstrapAdminViaCli(user.email);
  await signIn(request, user);
  await signInViaUi(page, user);

  // First add.
  const r1 = await request.post(`${BACKEND}/api/settings/keys`, {
    data: { provider: "anthropic", api_key: "sk-test-original-12345" },
  });
  expect(r1.status()).toBe(201);
  // Then rotate.
  const r2 = await request.post(`${BACKEND}/api/settings/keys`, {
    data: { provider: "anthropic", api_key: "sk-test-rotated-67890" },
  });
  expect(r2.status()).toBe(201);

  // Two rows: an "added" then a "rotated".
  const page1 = await readWorkspaceReconstruction(request, {
    action: "user.key.configured",
  });
  const matching = page1.entries.filter(
    (e) => e.action === "user.key.configured",
  );
  expect(matching.length).toBeGreaterThanOrEqual(2);
  const actions = matching.map((e) => e.payload.action);
  expect(actions).toContain("added");
  expect(actions).toContain("rotated");
});

test("DELETE emits user.key.revoked with provider name", async ({
  page,
  request,
}) => {
  const user = await registerUser(request, "p15c-keys-del");
  await bootstrapAdminViaCli(user.email);
  await signIn(request, user);
  await signInViaUi(page, user);

  await request.post(`${BACKEND}/api/settings/keys`, {
    data: { provider: "anthropic", api_key: "sk-test-toberevoked" },
  });
  const del = await request.delete(`${BACKEND}/api/settings/keys/anthropic`);
  expect(del.status()).toBe(204);

  const row = await expectWorkspaceAuditRow(request, "user.key.revoked");
  expect(row.payload.provider).toBe("anthropic");
});

test("GET /api/settings/keys emits NONE (read endpoint)", async ({
  request,
}) => {
  const user = await registerUser(request, "p15c-keys-read");
  await bootstrapAdminViaCli(user.email);
  await signIn(request, user);

  // Pre-read: count user.key.* rows in workspace scope.
  const pre = await readWorkspaceReconstruction(request);
  const preKeyRows = pre.entries.filter((e) =>
    e.action.startsWith("user.key."),
  );

  // Read the keys list 5 times.
  for (let i = 0; i < 5; i++) {
    const resp = await request.get(`${BACKEND}/api/settings/keys`);
    expect(resp.ok()).toBe(true);
  }

  // Post-read: count is unchanged. Per Phase 13b Decision #1 reads
  // do not emit audit rows.
  const post = await readWorkspaceReconstruction(request);
  const postKeyRows = post.entries.filter((e) =>
    e.action.startsWith("user.key."),
  );
  expect(postKeyRows.length).toBe(preKeyRows.length);
});
