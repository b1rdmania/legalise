# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: first-run.spec.ts >> first-run journey: register → bootstrap CLI → auth refresh → install → grant → run → reconstruction
- Location: e2e/first-run.spec.ts:41:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Administrator not yet bootstrapped/i)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/Administrator not yet bootstrapped/i)

```

```yaml
- complementary "Navigation":
  - link "Legalise":
    - /url: /matters
    - text: Legalise.
  - link "New matter":
    - /url: /matters/new
  - navigation "Workspace sections":
    - link "Matters":
      - /url: /matters
    - link "Skill library":
      - /url: /skills
    - link "Your skills":
      - /url: /register
    - text: Admin
    - link "Users":
      - /url: /admin/users
    - link "Audit":
      - /url: /admin/audit
  - link "Settings":
    - /url: /settings/profile
  - link "Help":
    - /url: /help
  - button "P p15-first-run-c52d3a65@example.com"
- main:
  - heading "Matters" [level=1]
  - paragraph: The cause list
  - paragraph: Every matter this workspace holds, entered in the order it was opened. An entry records the matter's type, whether it stands open or closed, and the posture of its privilege. Open an entry to take up the matter.
  - link "New matter":
    - /url: /matters/new
  - text: Start here
  - paragraph: New to the workspace? Walk the public demo to see the whole loop end to end, with nothing to set up. To run skills on your own matters, add a model key in settings.
  - link "Walk the demo":
    - /url: /guided-demo
  - link "Add a model key":
    - /url: /settings/keys
  - heading "Schedule of matters" [level=2]
  - text: "1"
  - link "0001 Employment Tribunal Khan v Acme Trading Ltdkhan-v-acme-trading-2026 open Active 2026-05-12":
    - /url: /matters/khan-v-acme-trading-2026/assistant
```

# Test source

```ts
  1   | /**
  2   |  * Phase 15 B — first-run end-to-end.
  3   |  *
  4   |  * Walks Journey 00 verbatim against the FINAL post-14.5 contracts.
  5   |  * Every step asserts the substrate audit row that the audit-map
  6   |  * documents. No test-only substrate; no fake provider key; the
  7   |  * stub-echo keyless model is opted into via existing operator
  8   |  * surfaces (PATCH /auth/users/me default_model_id, POST /api/matters
  9   |  * with default_model_id).
  10  |  *
  11  |  * Wall-clock is NOT a contract here per the v3 plan; the test
  12  |  * reports its duration in the trace but doesn't hard-fail.
  13  |  */
  14  | 
  15  | import { test, expect } from "@playwright/test";
  16  | import { firstRunReset } from "./fixtures/db";
  17  | import {
  18  |   bootstrapAdminViaCli,
  19  |   registerUser,
  20  |   signIn,
  21  |   signInViaUi,
  22  |   whoami,
  23  | } from "./fixtures/auth";
  24  | import {
  25  |   createMatter,
  26  |   expectMatterAuditRow,
  27  |   expectWorkspaceAuditRow,
  28  |   getBootstrapState,
  29  |   readMatterReconstruction,
  30  |   setUserDefaultModel,
  31  | } from "./fixtures/api";
  32  | 
  33  | const BACKEND = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
  34  | const KEYLESS_MODEL = "stub-echo";
  35  | 
  36  | test.beforeEach(async () => {
  37  |   // The first-run scenario depends on a truly empty users table.
  38  |   await firstRunReset();
  39  | });
  40  | 
  41  | test("first-run journey: register → bootstrap CLI → auth refresh → install → grant → run → reconstruction", async ({
  42  |   page,
  43  |   request,
  44  | }) => {
  45  |   // ---------------------------------------------------------------
  46  |   // 1. Fresh DB. /app empty-state renders.
  47  |   // ---------------------------------------------------------------
  48  |   const initial = await getBootstrapState(request);
  49  |   expect(initial.user_count).toBe(0);
  50  |   expect(initial.has_superuser).toBe(false);
  51  | 
  52  |   await page.goto("/app");
  53  |   // Phase 14 A P1 invariant — copy MUST NOT claim registration
  54  |   // grants admin. Assert the empty-state heading + absence of
  55  |   // admin-promotion language.
  56  |   await expect(page.getByText(/No accounts yet/i)).toBeVisible();
  57  |   const body = (await page.textContent("body")) ?? "";
  58  |   expect(body).not.toMatch(/becomes the workspace administrator/i);
  59  |   expect(body).not.toMatch(/first user becomes admin/i);
  60  |   expect(body).toMatch(/bootstrap CLI/i);
  61  | 
  62  |   // ---------------------------------------------------------------
  63  |   // 2. Register first account via the real form. Dev-autoverify is
  64  |   //    on, so the chain (registered → verified → demo_seeded →
  65  |   //    demo_seeded) lands inline.
  66  |   // ---------------------------------------------------------------
  67  |   const user = await registerUser(request, "p15-first-run");
  68  |   // Sign the page in via the real UI form so cookies land in the
  69  |   // browser context.
  70  |   await signInViaUi(page, user);
  71  |   // Sign the request context in too so subsequent API helpers
  72  |   // share auth.
  73  |   await signIn(request, user);
  74  | 
  75  |   // Substrate scope split (backend/app/core/auth.py:147-156):
  76  |   //   - auth.user.demo_seeded is matter-scoped (passes
  77  |   //     matter_id=matter.id because Khan was just created).
  78  |   //   - auth.user.registered / .verified
  79  |   //     land at workspace scope (matter_id IS NULL). Those rows can
  80  |   //     only be read by a superuser via /admin/audit/reconstruction;
  81  |   //     they're asserted further down once bootstrap has promoted
  82  |   //     this user.
  83  |   await expectMatterAuditRow(
  84  |     request,
  85  |     "khan-v-acme-trading-2026",
  86  |     "auth.user.demo_seeded",
  87  |   );
  88  | 
  89  |   // ---------------------------------------------------------------
  90  |   // 3. /app now shows "Bootstrap admin required" because
  91  |   //    user_count > 0 but has_superuser still false.
  92  |   // ---------------------------------------------------------------
  93  |   await page.goto("/app");
  94  |   await expect(
  95  |     page.getByText(/Administrator not yet bootstrapped/i),
> 96  |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  97  |   await expect(
  98  |     page.getByText("python -m app.tools.bootstrap_admin <email>"),
  99  |   ).toBeVisible();
  100 |   await expect(
  101 |     page.getByText("backend/app/tools/bootstrap_admin.py"),
  102 |   ).toBeVisible();
  103 | 
  104 |   // ---------------------------------------------------------------
  105 |   // 4. Run the Phase 12 CLI via docker compose exec — real
  106 |   //    operator surface, not mocked.
  107 |   // ---------------------------------------------------------------
  108 |   await bootstrapAdminViaCli(user.email);
  109 | 
  110 |   // The CLI emits user.admin.bootstrapped at workspace scope.
  111 |   // Need a superuser session to read /admin/audit; the CLI's
  112 |   // promotion has already landed, but the browser + request
  113 |   // contexts still see the stale pre-promotion identity. Refresh
  114 |   // the request context's session by signing in again — this
  115 |   // exercises the auth bootstrap path the README documents for
  116 |   // post-CLI use.
  117 |   await signIn(request, user);
  118 |   await expectWorkspaceAuditRow(request, "user.admin.bootstrapped");
  119 | 
  120 |   // Now that we have superuser, assert the workspace-scoped auth
  121 |   // rows from registration (see note above the matter assertion).
  122 |   await expectWorkspaceAuditRow(request, "auth.user.registered");
  123 |   await expectWorkspaceAuditRow(request, "auth.user.verified");
  124 | 
  125 |   // ---------------------------------------------------------------
  126 |   // 5. EXPLICIT AUTH REFRESH. AuthProvider caches the user object;
  127 |   //    after a CLI promotion we need a reload so /auth/users/me
  128 |   //    refetches and the React context flips is_superuser→true.
  129 |   //    Without this the test passes/fails on cache behaviour
  130 |   //    rather than product contract.
  131 |   // ---------------------------------------------------------------
  132 |   await page.reload();
  133 |   // After reload AuthProvider re-fetches; /app renders the authed
  134 |   // home for a superuser. Verify via whoami too.
  135 |   const me = await whoami(request);
  136 |   expect(me.is_superuser).toBe(true);
  137 |   await page.goto("/app");
  138 |   await expect(page.getByRole("heading", { name: /^Matters$/ })).toBeVisible();
  139 | 
  140 |   // ---------------------------------------------------------------
  141 |   // 6. Keyless invocation path. PATCH the user default to
  142 |   //    stub-echo, then create a fresh matter that inherits it.
  143 |   //    No fake provider key required.
  144 |   // ---------------------------------------------------------------
  145 |   await setUserDefaultModel(request, KEYLESS_MODEL);
  146 |   const matter = await createMatter(request, {
  147 |     title: "Phase 15 first-run target",
  148 |     default_model_id: KEYLESS_MODEL,
  149 |     privilege_posture: "A_cleared",
  150 |   });
  151 |   expect(matter.default_model_id).toBe(KEYLESS_MODEL);
  152 | 
  153 |   // PATCH /auth/users/me emits auth.user.profile_updated at
  154 |   // workspace scope; matter create lands matter.create on the
  155 |   // matter timeline.
  156 |   await expectWorkspaceAuditRow(request, "auth.user.profile_updated");
  157 |   await expectMatterAuditRow(request, matter.slug, "matter.create");
  158 | 
  159 |   // ---------------------------------------------------------------
  160 |   // 7. /modules → Contract Review → Install → drive the trust
  161 |   //    ceremony state machine to ENABLED.
  162 |   // ---------------------------------------------------------------
  163 |   // Find the Contract Review module in the v2 catalog. The
  164 |   // ratification fixtures may name it differently per the
  165 |   // examples/modules/contract_review/module.json id; query the
  166 |   // catalog to be flexible.
  167 |   const catalog = await request.get(`${BACKEND}/api/modules/v2`);
  168 |   expect(catalog.ok()).toBe(true);
  169 |   const catalogBody = (await catalog.json()) as {
  170 |     modules: Array<{ module_id: string; manifest: Record<string, unknown> }>;
  171 |   };
  172 |   const cr = catalogBody.modules.find(
  173 |     (m) => m.module_id.includes("contract") || m.module_id.includes("review"),
  174 |   );
  175 |   // Skip the rest of the journey if Contract Review isn't
  176 |   // present — the test environment may not have it installed on
  177 |   // disk. Filed as a Phase 15 finding if that's the case.
  178 |   test.skip(
  179 |     cr === undefined,
  180 |     "Contract Review module not discovered; e2e env needs the example modules on disk",
  181 |   );
  182 |   const moduleId = cr!.module_id;
  183 | 
  184 |   // Start the ceremony via the real endpoint, drive it to ENABLED
  185 |   // through the same advance calls the UI would issue.
  186 |   const ceremonyResp = await request.post(`${BACKEND}/api/modules/install`, {
  187 |     data: { source: "registry", module_id: moduleId },
  188 |   });
  189 |   expect(ceremonyResp.status()).toBe(201);
  190 |   let ceremony = await ceremonyResp.json();
  191 |   // Drive trust → trust → … → grant until ENABLED.
  192 |   let safety = 16;
  193 |   while (!ceremony.is_terminal && safety-- > 0) {
  194 |     const action = ceremony.state === "granted" ? "grant" : "trust";
  195 |     const advance = await request.post(
  196 |       `${BACKEND}/api/modules/install/${ceremony.ceremony_id}/advance`,
```