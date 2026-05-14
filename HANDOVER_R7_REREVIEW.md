# R7 Fix Re-review

Reviewed head: `f807b44`

Reviewer role: verify the R7 P1/P2/P3 fixes actually closed, then patch only narrow stale-copy misses if found.

## 1. Result

R7 is effectively closed after one extra stale-copy cleanup.

The original `f807b44` fixes hold:

- ROADMAP now contains a load-bearing **Module lifecycle workstream (v0.2)** mapping the five missing lifecycle bullets.
- Current-facing hero/platform copy is no longer trying to make Pre-Motion the project identity.
- Day 17 no longer commits to README prose work that already shipped at Day 17a.
- Contract Review copy clearly presents a v0.2 roadmap surface, not a half-shipped module.
- Long prompt bodies on `#/modules` are capped with `max-h-[60vh]` and `overflow-auto`.

## 2. One issue found and fixed

The re-grep found two stale Plain-English references outside the files changed by `f807b44`:

- `EXECUTIVE_SUMMARY.md` still said Plain-English ships as a launch-week stretch and SDK-extensibility proof.
- `SCOPE.md` still said Plain-English is a launch-week stretch.

Both now say the same thing as `BUILD_PLAN.md`: Plain-English is retired from v0.1; `#/modules` Discovery over `PLUGINS_ROOT` is the SDK/extensibility proof.

## 3. Re-review answers

### Does ROADMAP cover all five previously-unmapped module lifecycle bullets?

Yes.

It maps:

- install / enable toggles per workspace
- per-workspace module policy
- module permissions
- UI contracts
- signed manifests / provenance attestation

The entries are specific enough to be load-bearing: each names a storage or enforcement boundary (`enabled_skills` table, policy intersection, SDK boundary checks, host boundary component, signature / trust-root model).

### Did the hero sweep miss anything in current-facing docs?

Only the Plain-English stretch references above. Those are fixed.

Remaining "hero" hits are either:

- historical handover docs,
- design/mockup internals,
- code comments naming a visual hero section,
- or explicit post-pivot notes explaining that Pre-Motion is a canonical demonstration, not the project identity.

### Do Day 17 / Contract Review / max-height fixes hold?

Yes.

- `BUILD_PLAN.md` now separates Day 17 launch assets from Day 17a README/copy work already shipped.
- Contract Review copy in `frontend/src/App.tsx` is honest v0.2 language.
- Module prompt body rendering now uses `overflow-auto max-h-[60vh]`, so long `SKILL.md` bodies no longer stretch the whole page indefinitely.

## 4. Checks run

```bash
rg -n "Plain-English|plain-English|plain English|SDK-extensibility proof|launch-week stretch" README.md EXECUTIVE_SUMMARY.md SCOPE.md ROADMAP.md BUILD_PLAN.md docs/TRUST.md MANIFESTO.md frontend/src/App.tsx
rg -n "Legalise is a platform|hero module|the hero module|five end-to-end modules|five modules|install marketplace UI|project's identity|audited execution layer" README.md EXECUTIVE_SUMMARY.md SCOPE.md ROADMAP.md BUILD_PLAN.md docs/TRUST.md MANIFESTO.md frontend/src/App.tsx
git diff --check
npm run typecheck
npm run build
```

Results:

- grep now shows only consistent retired/explicit framing hits
- `git diff --check` clean
- frontend typecheck passed
- frontend production build passed
