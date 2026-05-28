# Live Route Acceptance — 2026-05-28

**Status:** lightweight waiting-room acceptance pass.  
**Branch checked locally:** `phase-17-crm-pass`.  
**Production checked:** `https://legalise.dev` + `https://api.legalise.dev`.

## Network Checks

Ran with network access from the local repo.

| Route | Result |
| --- | --- |
| `https://legalise.dev/` | `200` |
| `https://legalise.dev/modules` | `200` |
| `https://legalise.dev/demo` | `200` |
| `https://legalise.dev/app` | `200` |
| `https://legalise.dev/auth/signin` | `200` |
| `https://legalise.dev/waitlist` | `200` |
| `https://api.legalise.dev/health` | `{"status":"ok","version":"0.1.0a0","database":"ok","environment":"demo"}` |
| `https://api.legalise.dev/api/system/bootstrap-state` | `{"user_count":3,"has_superuser":true}` |

The route checks only prove the SPA and API respond. They do not prove the route text is current, because the static HTML shell does not server-render the React route body.

## Source-Level Copy Findings Patched

Patched locally in this pass:

- Landing eyebrow changed from `v0.4 evaluation release` to `Open evaluation workspace`.
- Landing headline support copy no longer says the product is built specifically so "a solicitor" can show sign-off.
- Public modules page now offers `Create account`, not `Join waitlist`.
- Disabled assistant strips now point to account creation/sign-in, not waitlist.
- Static demo document-edit CTA now says `Create account to edit or anonymise`.
- README hosted posture now says evaluation signup is open.
- Manifesto copy now frames firm seniority gates as staged for deployments, not launch-day evaluator work.

## Still To Verify In Browser

Once the next frontend deploy is actually published:

1. `/` should show open evaluation copy and no stale `v0.4 evaluation release` eyebrow.
2. `/modules` unauthenticated should show the public catalogue and `Create account`, not `Join waitlist`.
3. `/demo` should not contain waitlist-era edit/anonymise CTAs.
4. Disabled assistant strips should send users to signup/signin.
5. The real signed-in matter path should be re-walked with dormant firm role gates enabled by default.

## Not Touched

- Role-gate implementation and posture banner logic. Phase 17.5 landed underneath this pass; this note only covers the surrounding copy/product truth.
- Cloudflare Pages token. Reported sorted by user/other-agent.
- Deep UI redesign of admin/settings/module pages. Captured in `docs/LAUNCH_TRUTH.md` and backlog.
