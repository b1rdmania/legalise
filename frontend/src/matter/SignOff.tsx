/**
 * /matters/:slug/artifacts/:artifactId/sign — Professional Sign-Off v1.
 *
 * The hero gate: a solicitor reads an AI-prepared output and takes
 * professional ownership of it — "do you stand behind this output?" Full
 * surface, not a modal: the output on one side, the decision + reasoning +
 * an explicit "I have reviewed this" affirmation on the other.
 *
 * This is author sign-off — the signer may be the artifact author. It is
 * NOT supervisor review (that's the firm-mode path under Approvals). Copy
 * stays inside the boundary: "Signed in Legalise" / "professional
 * ownership" — never "SRA approved" / "certified legal advice".
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  createSignoff,
  readArtifact,
  type ArtifactRead,
  type SignoffDecision,
} from "../lib/api";
import { ArtifactPreview } from "./ArtifactPreview";
import { ErrorCallout, LoadingLine, PageHeader } from "../ui/primitives";

const DECISIONS: { value: SignoffDecision; label: string; help: string }[] = [
  { value: "signed", label: "Sign", help: "I have reviewed this and I stand behind it." },
  {
    value: "signed_with_observations",
    label: "Sign with observations",
    help: "I stand behind it, with points I would change or that warrant attention.",
  },
  { value: "rejected", label: "Reject draft", help: "I do not stand behind this draft." },
];

const REASONING_REQUIRED: SignoffDecision[] = ["signed_with_observations", "rejected"];

// Quiet source-coverage note near the affirmation. Advisory only — never
// blocks signing (a hard block would be false precision for legacy and
// non-document outputs). Surfaces zero-sources and quote-not-found as
// cautions to review before signing.
function SignoffCoverage({ payload }: { payload: Record<string, unknown> }) {
  const anchors = Array.isArray(payload.source_anchors)
    ? (payload.source_anchors as Array<Record<string, unknown>>)
    : null;
  if (anchors === null) return null; // not a source-anchored output
  const claims = Array.isArray(payload.claims)
    ? (payload.claims as Array<Record<string, unknown>>)
    : [];
  const docs = anchors.filter((a) => !a.quote).length;
  const cited = claims.filter(
    (c) => Array.isArray(c.anchor_ids) && c.anchor_ids.length > 0,
  ).length;
  const quoteMissing = anchors.some((a) => a.quote_found_in_source === false);
  const zero = anchors.length === 0;
  return (
    <div className="mt-4 rounded-md border border-line px-3 py-2 text-xs" data-testid="signoff-source-coverage">
      <p className="font-medium text-ink">Source coverage</p>
      {zero ? (
        <p className="mt-1 text-seal" data-testid="signoff-no-sources">
          No sources cited for this output. Review independently before signing.
        </p>
      ) : (
        <p className="mt-1 text-muted">
          {docs} document{docs === 1 ? "" : "s"} cited
          {claims.length > 0 ? ` · ${cited}/${claims.length} claims cited` : ""}. Sources are
          cited for review; Legalise does not certify they prove the claim.
        </p>
      )}
      {quoteMissing && (
        <p className="mt-1 text-seal" data-testid="signoff-quote-missing">
          A cited quote was not found in its source document — verify before signing.
        </p>
      )}
    </div>
  );
}

export function SignOff({ slug, artifactId }: { slug: string; artifactId: string }) {
  const nav = useNavigate();
  const [artifact, setArtifact] = useState<ArtifactRead | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [decision, setDecision] = useState<SignoffDecision>("signed");
  const [reasoning, setReasoning] = useState("");
  const [affirmed, setAffirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readArtifact(slug, artifactId)
      .then((a) => !cancelled && setArtifact(a))
      .catch((err: unknown) => !cancelled && setLoadErr(String(err)));
    return () => {
      cancelled = true;
    };
  }, [slug, artifactId]);

  const reasoningNeeded = REASONING_REQUIRED.includes(decision);
  const canSubmit =
    affirmed && !submitting && (!reasoningNeeded || reasoning.trim().length > 0);

  const submit = async () => {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const signoff = await createSignoff(slug, {
        artifact_id: artifactId,
        decision,
        reasoning: reasoning.trim() || undefined,
      });
      void nav({
        to: "/matters/$slug/signoffs/$signoffId",
        params: { slug, signoffId: signoff.id },
      });
    } catch (err) {
      setSubmitErr(String(err));
      setSubmitting(false);
    }
  };

  if (loadErr) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <ErrorCallout message={`Artifact not found: ${loadErr}`} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-ink">
      <PageHeader
        eyebrow="Professional sign-off"
        title="Review and sign this output"
        description="You are taking professional ownership of this AI-prepared output. Read it, then record your decision. The exact output is hashed and pinned to your signature."
      />

      {artifact === null ? (
        <LoadingLine label="loading output" />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
          {/* The output under review */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-muted">
              Prepared output — {artifact.kind}
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Prepared by <span className="tech-token">{artifact.module_id}</span> ·{" "}
              <span className="tech-token">{artifact.capability_id}</span>. The output
              payload below is hashed and pinned on sign — this is what your
              signature attaches to.
            </p>
            <div data-testid="signoff-artifact">
              <ArtifactPreview payload={artifact.payload} kindHint={artifact.kind} matterSlug={slug} />
            </div>
          </section>

          {/* The decision desk */}
          <section className="lg:sticky lg:top-6 self-start rounded-md border border-rule bg-paper p-4">
            <h2 className="text-sm font-medium">Do you stand behind this output?</h2>

            <div className="mt-3 space-y-2">
              {DECISIONS.map((d) => (
                <label
                  key={d.value}
                  className={
                    "block cursor-pointer rounded-md border p-3 text-sm " +
                    (decision === d.value ? "border-ink" : "border-rule hover:border-ink/50")
                  }
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="decision"
                      value={d.value}
                      checked={decision === d.value}
                      onChange={() => setDecision(d.value)}
                      data-testid={`signoff-decision-${d.value}`}
                    />
                    <span className="font-medium">{d.label}</span>
                  </span>
                  <span className="mt-1 block pl-6 text-xs text-muted">{d.help}</span>
                </label>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-xs uppercase tracking-widest text-muted">
                Reasoning {reasoningNeeded ? "(required)" : "(optional)"}
              </label>
              <textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                rows={4}
                placeholder="What did you change, what would you change, or why are you signing despite it? This becomes part of the permanent record."
                className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm"
                data-testid="signoff-reasoning"
              />
            </div>

            <SignoffCoverage payload={artifact.payload} />

            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={affirmed}
                onChange={(e) => setAffirmed(e.target.checked)}
                className="mt-1"
                data-testid="signoff-affirm"
              />
              <span>
                I have reviewed this output and this records my professional ownership
                of it.
              </span>
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-seal disabled:opacity-50"
              data-testid="signoff-submit"
            >
              {submitting
                ? "Recording…"
                : decision === "rejected"
                  ? "Record rejection"
                  : "Sign in Legalise"}
            </button>
            {submitErr && <ErrorCallout message={submitErr} compact />}

            <p className="mt-3 text-[11px] text-muted">
              Signed in Legalise as your account. This records professional ownership;
              it is not a regulatory approval or a certification of legal advice.{" "}
              <Link
                to="/matters/$slug/artifacts/$artifactId"
                params={{ slug, artifactId }}
                className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
              >
                Cancel
              </Link>
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
