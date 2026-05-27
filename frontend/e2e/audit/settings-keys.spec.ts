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
 * rotate emit + `:122` for the revoke. This spec drives the UI
 * forms; the rows show up on the matter reconstruction *for the
 * matter the user has* (the key audit emits with the user's auto-
 * seeded Khan matter context — verify via the matter audit
 * endpoint).
 *
 * Phase 13b D pins the key bytes never appearing in any audit
 * payload; this e2e regression asserts the same on the row read
 * back from the substrate.
 */

import { test, expect } from "@playwright/test";
import { standardE2eReset } from "../fixtures/db";
import { registerUser, signIn, signInViaUi } from "../fixtures/auth";
import {
  readMatterReconstruction,
  expectMatterAuditRow,
} from "../fixtures/api";

const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
const KHAN = "khan-v-acme-trading-2026";

test.beforeEach(async () => {
  await standardE2eReset();
});

test("settings/keys emits user.key.configured (added) without leaking the key bytes", async ({
  page,
  request,
}) => {
  const user = await registerUser(request, "p15c-keys-add");
  await signIn(request, user);
  await signInViaUi(page, user);

  // POST a key via the real settings endpoint. Driving via the UI
  // form is equally valid; using the API for setup is faster and
  // the assertion is on the substrate row, not the form.
  const apiKey = "sk-test-12345678";
  const resp = await request.post(`${BACKEND}/api/settings/keys`, {
    data: { provider: "anthropic", api_key: apiKey },
  });
  expect(resp.status()).toBe(201);

  // Substrate audit row lands with payload.action="added" and the
  // key bytes never appear.
  const row = await expectMatterAuditRow(request, KHAN, "user.key.configured");
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
  const page1 = await readMatterReconstruction(request, KHAN, {
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
  await signIn(request, user);
  await signInViaUi(page, user);

  await request.post(`${BACKEND}/api/settings/keys`, {
    data: { provider: "anthropic", api_key: "sk-test-toberevoked" },
  });
  const del = await request.delete(`${BACKEND}/api/settings/keys/anthropic`);
  expect(del.status()).toBe(204);

  const row = await expectMatterAuditRow(request, KHAN, "user.key.revoked");
  expect(row.payload.provider).toBe("anthropic");
});

test("GET /api/settings/keys emits NONE (read endpoint)", async ({
  request,
}) => {
  const user = await registerUser(request, "p15c-keys-read");
  await signIn(request, user);

  // Pre-read: count user.key.* rows.
  const pre = await readMatterReconstruction(request, KHAN);
  const preKeyRows = pre.entries.filter((e) => e.action.startsWith("user.key."));

  // Read the keys list 5 times.
  for (let i = 0; i < 5; i++) {
    const resp = await request.get(`${BACKEND}/api/settings/keys`);
    expect(resp.ok()).toBe(true);
  }

  // Post-read: count is unchanged. Per Phase 13b Decision #1 reads
  // do not emit audit rows.
  const post = await readMatterReconstruction(request, KHAN);
  const postKeyRows = post.entries.filter((e) => e.action.startsWith("user.key."));
  expect(postKeyRows.length).toBe(preKeyRows.length);
});
