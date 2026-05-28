# Launch Truth

**Status:** working source of truth for the evaluation launch.  
**Date:** 2026-05-28.  
**Scope:** what should be live, what should stay dormant, and what should not be claimed.

## One-Sentence Product

Legalise is an open-source, matter-first workspace for evaluating governed legal AI: install signed modules, grant matter-scoped permissions, run them on a sample matter, inspect artifacts, and reconstruct the audit trail.

## What Must Be Live

These are the launch-critical surfaces:

1. **Open evaluation signup**
   - A visitor can create an account.
   - The product does not tell them to join a waitlist.
   - The account is for evaluation only, not live client matters.

2. **First-run path**
   - The app can reach a usable signed-in state.
   - The first-admin/bootstrap story works for local forks.
   - `legalise doctor` gives operators a clear health check.

3. **Khan v Acme demo loop**
   - Open the sample matter.
   - See documents and matter context.
   - Install or inspect reference modules.
   - Grant module capabilities.
   - Run Contract Review / Pre-Motion.
   - See artifacts/results.
   - Open the audit reconstruction.

4. **Module manager**
   - Public catalogue is browseable without auth.
   - Signed-in users can see installed modules and trust status.
   - Install/update/revoke/trust ceremony is available for admins.
   - Matter-level grant/revoke is visible where work happens.

5. **Audit and oversight**
   - Matter audit timeline is readable.
   - Workspace/admin audit is available to superusers.
   - Invocations and artifacts deep-link to reconstruction.
   - Blocked/denied attempts are visible, not swallowed.

6. **Provider keys/settings**
   - BYO key management exists and is understandable.
   - The product never implies Legalise supplies production model access.

7. **Docs for forkers**
   - Clone.
   - Copy `.env`.
   - Bring up compose.
   - Register.
   - Bootstrap.
   - Run doctor.
   - Walk the demo.
   - Troubleshoot common failures.

## What Is Intentionally Dormant

These should stay in the codebase but not shape the default live evaluation flow:

1. **Firm role hierarchy gates**
   - `solicitor`, `qualified_solicitor`, and `workspace_admin` remain as substrate/admin vocabulary.
   - The default evaluator path should not require understanding or satisfying `qualified_solicitor`.
   - B_mixed matters should not block normal evaluator module runs because of role hierarchy in the default evaluation configuration.
   - C_paused may remain a hard stop because it is a matter-pause state, not a junior/senior role gate.

2. **Advanced supervisor sign-off**
   - The advice-boundary substrate can stay.
   - Do not claim a full regulated-firm supervisor workflow is live.
   - Do not make evaluator onboarding depend on it.

3. **Connectors**
   - MCP/vendor connector strategy is valid.
   - Launch does not need DocuSign/iManage/NetDocuments integration.

4. **Async/streaming runtime**
   - Park until a real long-running capability hurts.
   - Do not unpark just because an old plan exists.

5. **Full marketplace mechanics**
   - Module catalogue and trust ceremony are enough for evaluation.
   - Ratings, third-party marketplace governance, payments, and broad submissions are post-launch.

6. **Legal-quality eval harness**
   - Basic smoke/e2e exists.
   - Full grounding/citation/refusal benchmark is post-evaluation-launch unless explicitly pulled forward.

## What Not To Claim

Do not claim:

- Legalise is a law firm.
- Legalise gives legal advice.
- Legalise is ready for live client matters.
- A regulator has approved the workflow.
- The audit trail is forensically tamper-proof against a DB superuser.
- The hosted site supplies production model keys.
- The firm role hierarchy is the launch-day governance proof.
- A complete supervisor-gate system is live.

Safe claim:

> Legalise demonstrates an inspectable legal-AI workspace: matter-scoped context, signed modules, capability grants, BYO model access, artifacts, and audit reconstruction.

## Product Tone

Use calm operator language:

- "Create account", not "join waitlist".
- "Evaluation workspace", not "closed beta".
- "Run the sample matter", not "prove legal autonomy".
- "Audit trail", not "compliance magic".
- "Firm controls are staged", not "qualified solicitor required" in the evaluator path.

## Current UX Weakness To Fix

Admin, settings, and module surfaces exist, but parts still feel like substrate wrapped in UI. The next product pass should make them feel like a boring operator product:

- left nav and page hierarchy should be predictable;
- module install should feel like an integrations page;
- grants should feel like permissions, not a database row editor;
- settings should explain BYO keys and provider status plainly;
- admin should be sparse, safe, and obvious;
- audit should read like an activity timeline with regulator-grade detail.

The goal is not a new visual system. It is familiar CRM/admin ergonomics over the existing governance substrate.
