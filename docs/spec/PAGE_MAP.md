# Page Map — Authenticated App Surface

**Phase 13 Step 1.**  All routes are inside the SPA; `legalise.dev` marketing site is out of scope.

The matter workspace `/matters/{slug}` is the load-bearing surface. Most journeys pass through it. It's structured as a hub with installed-modules + artifacts + reconstruction-link panels.

## Route table

| Route | Surface category | Primary journey(s) | API calls | Per-page state | Inbound links |
| --- | --- | --- | --- | --- | --- |
| `/app` | App home / first-run | first-run, post-login default | `GET /auth/users/me`, `GET /api/matters` | `user`, `matters[]` | post-login redirect; top-nav home |
| `/auth/login` | Auth | login | `POST /auth/login` | local form state | landing, logout, session expiry |
| `/auth/register` | Auth | signup | `POST /auth/register` | local form state | login page |
| `/auth/verify` | Auth | email verification | `POST /auth/verify` | URL token | registration email |
| `/auth/forgot-password` | Auth | password reset request | `POST /auth/forgot-password` | local form state | login page |
| `/auth/reset-password` | Auth | password reset | `POST /auth/reset-password` | URL token | reset email |
| `/settings` | Settings | profile / overview | `GET /auth/users/me` | `user` | top-nav |
| `/settings/keys` | Settings | BYO key setup | `GET /api/settings/keys`, `POST /api/settings/keys`, `DELETE /api/settings/keys/{provider}` | `keys[]`, form draft | settings nav, posture/invocation error banners (key-missing) |
| `/matters` | Matters | matter list / open Khan | `GET /api/matters` | `matters[]` | app home, top-nav |
| `/matters/new` | Matters | create matter | `POST /api/matters` | local form state | matters list |
| `/matters/{slug}` | Matter workspace | hub — most journeys pass through | `GET /api/matters/{slug}`, `GET /api/matters/{slug}/documents`, `GET /api/matters/{slug}/grants`, `GET /api/matters/{slug}/artifacts` ★ | `matter`, `documents[]`, `grants[]`, `artifacts[]`, posture banner | matters list, top-nav recent |
| `/matters/{slug}/documents/{doc_id}` | Matter workspace | inspect document | `GET /api/documents/{doc_id}/body` | `document`, `body` | matter workspace |
| `/matters/{slug}/audit` | Reconstruction / oversight | inspect audit trail | `GET /api/matters/{slug}/audit/reconstruction` | `entries[]`, `cursor`, filter state | matter workspace, every posture/grant denial banner |
| `/matters/{slug}/artifacts` | Artifacts | list outputs | `GET /api/matters/{slug}/artifacts` ★ | `artifacts[]` | matter workspace |
| `/matters/{slug}/artifacts/{id}` | Artifacts | inspect output | `GET /api/matters/{slug}/artifacts/{id}` ★ | `artifact`, parsed payload | artifacts list, invocation success state |
| `/modules` | Modules | catalog | `GET /api/modules/v2` | `modules[]`, `installed[]` | top-nav |
| `/modules/{module_id}` | Modules | module detail | `GET /api/modules/v2/{module_id}` | `manifest`, `capabilities[]`, `installed_version?` | catalog, matter workspace |
| `/modules/install` | Modules | install ceremony | `POST /api/modules/install`, `POST /api/modules/install/{ceremony_id}/advance`, `GET /api/modules/install/{ceremony_id}` | `ceremony`, `permission_card` | module detail "Install" button |
| `/admin/users` | Admin | user list | `GET /api/admin/users` ★ | `users[]` | top-nav admin (superuser-only) |
| `/admin/users/{id}` | Admin | role mutation | `POST /api/admin/users/{id}/role` | `user`, form draft | admin users list |

★ = endpoint does not exist today; named in `BACKEND_GAP_AUDIT.md`.

## App home vs marketing landing

The **App home** (`/app`) row is the **authenticated entry / first-run screen** inside the SPA — the page a logged-in user sees by default, and where a fresh-fork evaluator lands after the first-admin bootstrap.

The public marketing site at `legalise.dev` (with the manifesto / brand seal / Warp 6-card grid) is **already shipped** and is NOT Phase 13's concern. The two never overlap in this phase; if a Phase 15+ feature needs an in-app link out to marketing, that's a single anchor, not a spec deliverable.

## Surface category index

Nine categories, mapped:

1. **App home** — `/app`
2. **Auth** — `/auth/*`
3. **Settings** — `/settings`, `/settings/keys`
4. **Matters** — `/matters`, `/matters/new`
5. **Matter workspace** — `/matters/{slug}`, `/matters/{slug}/documents/{doc_id}`
6. **Modules** — `/modules`, `/modules/{module_id}`, `/modules/install`
7. **Artifacts** — `/matters/{slug}/artifacts`, `/matters/{slug}/artifacts/{id}`
8. **Reconstruction / oversight** — `/matters/{slug}/audit`
9. **Admin** — `/admin/users`, `/admin/users/{id}`

## Global state model

What lives where:

- **Global (auth context)** — current user (from `GET /auth/users/me`), is_superuser flag, role, providers configured
- **Global (nav state)** — recent matters (max 3), top-nav open state
- **Per-matter** — matter row, documents, grants, artifacts, posture banner state, current invocation (if any)
- **Per-module** — manifest snapshot, installed version, install ceremony state (during ceremony only)
- **Per-page** — local form state, paginated lists, error/loading state

State is owned by the page that needs it. Cross-page sharing only for: current-user, top-nav recent-matters list. Everything else re-fetches on navigation.

## Empty/error/loading conventions

Phase 14 picks the components, but the spec pins the rules:

- **Loading** — skeleton state, never a spinner over old content. Buttons disable + spinner-inline during their own API call.
- **Empty** — explicit empty-state component with a CTA (e.g. "No matters yet — create your first"). Never a blank list.
- **Error** — structured banner with the error code, the action that failed, and a retry button where retry is safe.
- **403 from posture/grant** — banner deep-links to `/matters/{slug}/audit` filtered to the denial; see `POSTURE_GATE_UX.md`.
- **404** — page-level "not found" treatment with a back link to the parent surface.
- **500** — generic error banner with "Something went wrong; check the audit trail" + reconstruction link.

## Permission model in the UI

Three role tokens + the superuser bit, mirroring Phase 8 + Phase 11:

| Surface | `solicitor` | `qualified_solicitor` | `workspace_admin` | `is_superuser` extra |
| --- | --- | --- | --- | --- |
| Read matter (any posture) | ✓ | ✓ | ✓ | ✓ |
| Invoke on `A_cleared` matter | ✓ | ✓ | ✓ | — |
| Invoke on `B_mixed` matter | ✗ banner | ✓ | ✓ | — |
| Invoke on `C_paused` matter | ✗ banner | ✗ banner | ✗ banner | — |
| Install module | ✗ | ✗ | ✗ | ✓ |
| Mutate matter privilege posture | ✗ | ✗ | ✓ | — |
| Promote another user (HTTP) | ✗ | ✗ | ✗ | ✓ |

The UI hides admin surfaces from non-superusers (no `/admin` link in top-nav). It does NOT hide matter actions a user can't perform on a given matter — those render with a banner explaining why, deep-linking to reconstruction. Hiding silently is worse than showing-and-explaining for the trust-substrate claim.
