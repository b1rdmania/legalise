# Post-Phase-17 KISS Backlog

**Status:** pruned backlog for getting from "working" to "semi-coherent launch".  
**Rule:** do not add substrate unless the product path proves a real missing endpoint.

## Launch Blockers

1. **Ratify Phase 17.5 dormant firm role gates**
   - Default evaluator path must not require `qualified_solicitor`.
   - Role substrate stays; default evaluation config keeps firm role gates dormant.
   - C_paused remains a hard stop unless Reviewer changes that.

2. **Production copy consistency**
   - No waitlist language if signup is open.
   - No stale `v0.4 supervisor gate lands next` marketing copy on public surfaces.
   - No role-hierarchy onboarding in the evaluator path.

3. **End-to-end evaluator walk**
   - Create account.
   - Open Khan.
   - Install/grant/run one module.
   - Open artifact.
   - Open reconstruction.
   - Confirm no orphan links or dead copy.

4. **Frontend deploy certainty**
   - Cloudflare Pages deployment must be confirmed by conclusion, not trigger.
   - Manual Wrangler deploy is acceptable short-term, but CI must be trusted before public push.

## Launch Polish

1. **Operator UI calm-down**
   - Admin, settings, and modules exist but still feel like substrate surfaced directly.
   - Make them feel like standard SaaS operator screens: clear tables, tabs, empty states, filters, and direct action panels.

2. **Module manager ergonomics**
   - Modules should read like integrations.
   - Permission cards should explain what grants mean.
   - Installed/disabled/update states should be obvious at a glance.

3. **Settings/provider clarity**
   - BYO keys should be the first-class settings story.
   - Provider status/test-call should be obvious if already supported; otherwise backlog it.

4. **Audit as activity timeline**
   - Keep regulator-grade detail.
   - Improve grouping and labels so it does not feel like raw rows.

5. **Demo route coherence**
   - Decide whether `/demo` is a static marketing demo or a live IA showcase.
   - Avoid maintaining a parallel old shell that contradicts the real app.

## Post-Launch Firm Features

1. **Firm role hierarchy live mode**
   - Enable `solicitor` / `qualified_solicitor` / `workspace_admin` gates for real firm deployments.
   - Add clear role-request/approval UX only when needed.

2. **Advanced supervisor/advice gates**
   - Turn advice-boundary primitives into a real workflow.
   - Do not conflate this with the evaluation launch.

3. **Legal-quality evals**
   - Grounding, citation integrity, refusal behavior, golden matters.

4. **Prompt shroud**
   - Useful trust layer, but not required for this launch if claim boundary is honest.

5. **Connectors**
   - MCP/vendor connectors after the core product feels usable.

## Dead Or Obsolete Residue To Avoid Re-Litigating

- Waitlist-first hosted copy, unless access mode is deliberately flipped back.
- "Supervisor-gate primitive lands next" as front-page launch messaging.
- Role promotion as a prerequisite to seeing the demo work.
- Async/streaming as a prerequisite to product coherence.
- Large connector work before the module/audit workspace feels good.
