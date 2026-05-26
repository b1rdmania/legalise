# Posture Gate UX

How the matter's `privilege_posture` × the caller's `role` lands in the UI.

The substrate's `posture_gate.check_posture()` (Phase 8) emits a structured 403 with `posture_gate_blocked` body. This doc decides what that looks like in pixels.

## Policy table (mirrors `app/core/posture_gate.py:POSTURE_POLICY`)

| Posture | Required role token | Notes |
| --- | --- | --- |
| `A_cleared` | `any_authenticated` | matter cleared for non-solicitor work |
| `B_mixed` (default) | `qualified_solicitor` | privileged content present |
| `C_paused` | `matter_paused` (sentinel — nobody satisfies) | matter is paused; no capability runs |

## UX matrix — what the user sees on the matter workspace

**Substrate truth (load-bearing):** `app/core/posture_gate.py:POSTURE_POLICY` compares the actor's `role` string verbatim against the policy. `is_superuser` is NOT consulted. `workspace_admin` does NOT satisfy `B_mixed` — only `qualified_solicitor` does. Any UI that gives admins a pass here diverges from substrate behaviour and will lead to a confusing 403 from Phase 10 at invocation time.

| | `solicitor` (default role) | `qualified_solicitor` | `workspace_admin` / superuser |
| --- | --- | --- | --- |
| `A_cleared` | full UI, no banner | full UI, no banner | full UI, no banner |
| `B_mixed` | banner: "This matter is marked B_mixed. Only qualified solicitors can run modules. View audit trail." Modules panel renders read-only (capabilities visible, "Run" buttons disabled with tooltip). | full UI, no banner | **banner** — admin status does NOT satisfy posture. Admins see the same restriction as a `solicitor`. They retain admin-only privileges elsewhere (e.g. `PATCH /privilege` to change the matter's posture), but they cannot smuggle past the posture check itself. |
| `C_paused` | banner: "This matter is paused. No modules can run regardless of role." Modules panel renders read-only with all CTAs disabled. | same | same — even admins. Admins additionally see an "Unpause via `PATCH /api/matters/{slug}/privilege`" hint, since they're the only role that can change posture. |

### Banner shape

A structured component with:

- **Posture badge** — coloured pill: green for A_cleared, amber for B_mixed, red for C_paused.
- **Required role** — "Requires `qualified_solicitor`" (matter posture) or "Matter paused" (C_paused).
- **Actor role** — "Your role: `solicitor`" (so the user knows what they're missing).
- **Action link** — "View this matter's audit trail" deep-links to `/matters/{slug}/audit` filtered to recent `posture_gate.check.blocked` rows.
- **(Admin-only)** — `workspace_admin` viewing a B_mixed matter sees an extra link: "Change posture" → `PATCH /api/matters/{slug}/privilege`.

## What happens on actual invocation denial

If the user clicks "Run" on a capability where their role doesn't satisfy the matter posture, the Phase 10 endpoint returns HTTP 403 with `posture_gate_blocked` body:

```json
{
  "error": "posture_gate_blocked",
  "posture": "B_mixed",
  "required_role": "qualified_solicitor",
  "actor_role": "solicitor",
  "reason": "posture_gate_failed"
}
```

The UI catches this and re-renders the banner with an "Invocation blocked at <timestamp>" timestamp + a "View this denial in the audit trail" link that deep-links to `/matters/{slug}/audit?action=posture_gate.check.blocked&actor=<user_id>` (the action filter is a `BACKEND_GAP_AUDIT.md` finding if server-side filtering doesn't exist; client-side filtering is the fallback).

## Why this matters

The substrate emits the audit row regardless of whether the UI surfaces it. The UX matrix above isn't about preventing the audit — it's about preventing the user from wasting a click that's going to fail, AND about teaching them WHY it failed.

A non-solicitor on a B_mixed matter:
- Should NOT be hidden from seeing the matter — they can still read documents (the read endpoint has no posture gate, by design).
- Should see a clear "your role doesn't allow X" banner before they try.
- Should be able to click "View audit trail" and see their own previous denial (the audit-the-auditor property).

If we hid the matter entirely, we'd be teaching the user the system is broken. If we showed the matter without the banner, they'd hit the 403 and not know why. The banner is the right shape.

## `C_paused` is different

`C_paused` is a hard stop — even `workspace_admin` can't run modules on a paused matter. The model gateway (`ModelGateway.PrivilegePaused` exception at the gateway layer) already enforces this for model calls; Phase 8's `check_posture` extends to any capability invocation.

The banner for `C_paused` says: "This matter is paused. No modules can run regardless of role." with a link to documentation on what `C_paused` means + a `workspace_admin`-only "Unpause" CTA that goes through `PATCH /api/matters/{slug}/privilege`.

## Deep-link policy

Every posture banner has a "View this matter's audit trail" link. Deep-link format:

```
/matters/{slug}/audit?action=posture_gate.check.blocked&since=<24h-ago-ISO>
```

The default time window is the last 24 hours so the user sees their recent denials, not the matter's lifetime.

If a posture denial just happened (i.e. the banner appeared in response to a 403), the link adds `&invocation_id=<id-from-the-error>` so the exact denial row is highlighted.

## Open questions for Reviewer

1. **Posture change audit visibility.** When a `workspace_admin` changes a matter's posture (A_cleared → B_mixed, say), does the matter workspace banner show this in real-time? Or does the user have to refresh? Phase 13 punts to Phase 15+ — but flags that the audit row should land regardless.

2. **Self-service role request.** A `solicitor` on a B_mixed matter who needs to do real work currently has no in-app path to request promotion. They have to message an admin out of band. Phase 13 doesn't ship a "request promotion" flow — but Phase 15+ may add a simple `POST /api/role-requests` queue. Flagged here as an open product question.

3. **Per-document posture override.** Some matters might want to mark specific documents as `B_mixed` even though the matter is `A_cleared`. Out of scope; the current substrate posture is matter-level only.
