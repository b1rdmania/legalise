/**
 * /demo-loop — Guided Demo Loop v1.
 *
 * A fresh visitor watches the full supervised-autonomy loop run WITHOUT a
 * provider key: a seeded stub-echo matter → run an installed prompt skill →
 * a skill_response artifact appears → request supervisor review → open the
 * Record and see the chain.
 *
 * Every step calls the real endpoints (ensure / invoke / request-review).
 * Nothing is faked — stub-echo is a genuine keyless provider. The page is
 * explicit that this is a toy model path and a real provider key is needed
 * for real models.
 *
 * Note on review: the visitor RUNS the skill, so they are the artifact
 * author — and the review substrate forbids self-approval. That's the
 * separation-of-duties guarantee, surfaced here rather than bypassed: the
 * demo requests review and shows it pending; a different reviewer decides.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ensureGuidedLoop,
  invokeCapability,
  readArtifact,
  requestReview,
  type ArtifactRead,
  type GuidedDemoHandles,
} from "../lib/api";
import { ArtifactPreview } from "../matter/ArtifactPreview";
import { ErrorCallout, LoadingLine, PageHeader } from "../ui/primitives";
import { ProofDrawer } from "./ProofDrawer";
import { TrustReviewCard } from "./TrustReviewCard";

type Phase =
  | { step: "ensuring" }
  | { step: "ready" }
  | { step: "running" }
  | { step: "ran"; artifact: ArtifactRead; invocationId: string }
  | { step: "requesting"; artifact: ArtifactRead; invocationId: string }
  | { step: "reviewed"; artifact: ArtifactRead; invocationId: string };

export function DemoLoop() {
  const [handles, setHandles] = useState<GuidedDemoHandles | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "ensuring" });
  const [error, setError] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureGuidedLoop()
      .then((h) => {
        if (!cancelled) {
          setHandles(h);
          setPhase({ step: "ready" });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async () => {
    if (!handles) return;
    setPhase({ step: "running" });
    setError(null);
    try {
      const res = await invokeCapability(handles.matter_slug, {
        module_id: handles.module_id,
        capability_id: handles.capability_id,
        args: { document_id: handles.document_id, input: "Summarise this document." },
      });
      const artifactId = String(res.result.artifact_id ?? "");
      const artifact = await readArtifact(handles.matter_slug, artifactId);
      setPhase({ step: "ran", artifact, invocationId: res.invocation_id });
    } catch (err) {
      setError(String(err));
      setPhase({ step: "ready" });
    }
  };

  const review = async (cur: Extract<Phase, { step: "ran" }>) => {
    if (!handles) return;
    setPhase({ step: "requesting", artifact: cur.artifact, invocationId: cur.invocationId });
    setError(null);
    try {
      await requestReview(handles.matter_slug, cur.artifact.id);
      setPhase({ step: "reviewed", artifact: cur.artifact, invocationId: cur.invocationId });
    } catch (err) {
      setError(String(err));
      setPhase({ step: "ran", artifact: cur.artifact, invocationId: cur.invocationId });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Demo"
        title="Watch the governed loop"
        description="Watch the full supervised-autonomy loop run end to end — no provider key needed. This is a keyless demonstration matter modelled on the Khan v Acme employment dispute; real Khan remains the full workspace matter. Bring a real provider key (Settings → Keys) to run real models on your own matters."
      />

      {error && <ErrorCallout message={error} />}
      {phase.step === "ensuring" && <LoadingLine label="setting up the demo matter" />}

      {handles && phase.step !== "ensuring" && (
        <div className="space-y-6">
          <div className="rounded-md border border-seal/40 bg-seal/5 p-3 text-xs text-seal" data-testid="demo-banner">
            Demo · matter <span className="tech-token">{handles.matter_slug}</span> ·
            model <span className="tech-token">{handles.model_id}</span>. Keyless demonstration
            modelled on Khan v Acme. Not legal advice. Bring a key for real providers.
          </div>

          <TrustReviewCard onViewProof={() => setProofOpen(true)} />

          <ProofDrawer
            open={proofOpen}
            onClose={() => setProofOpen(false)}
            handles={handles}
            artifact={
              phase.step === "ran" || phase.step === "requesting" || phase.step === "reviewed"
                ? phase.artifact
                : undefined
            }
            invocationId={
              phase.step === "ran" || phase.step === "requesting" || phase.step === "reviewed"
                ? phase.invocationId
                : undefined
            }
            reviewRequested={phase.step === "reviewed"}
          />

          {/* Step 1 — run */}
          <Step n={1} title="Run a skill" done={phase.step !== "ready"}>
            <p className="text-sm text-muted">
              The demo skill <span className="tech-token">{handles.module_id}</span> reads{" "}
              <span className="tech-token">{handles.document_filename}</span> and writes a
              matter artifact — under the same privilege control, per-matter permissions, and audit as any
              real run.
            </p>
            <button
              type="button"
              onClick={run}
              disabled={phase.step === "running" || phase.step !== "ready"}
              className="mt-3 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
              data-testid="demo-run"
            >
              {phase.step === "running" ? "Running…" : "Run sample skill"}
            </button>
          </Step>

          {/* Step 2 — artifact */}
          {(phase.step === "ran" || phase.step === "requesting" || phase.step === "reviewed") && (
            <Step n={2} title="A skill_response artifact appears" done={phase.step !== "ran"}>
              <p className="text-sm text-muted">
                The model output is stored as a first-class, audited matter artifact.
              </p>
              <div data-testid="demo-artifact">
                <ArtifactPreview payload={phase.artifact.payload} kindHint={phase.artifact.kind} />
              </div>
              {phase.step === "ran" && (
                <button
                  type="button"
                  onClick={() => review(phase)}
                  className="mt-3 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
                  data-testid="demo-request-review"
                >
                  Request supervisor review
                </button>
              )}
              {phase.step === "requesting" && <LoadingLine label="requesting review" />}
            </Step>
          )}

          {/* Step 3 — review requested + separation of duties */}
          {phase.step === "reviewed" && (
            <Step n={3} title="Supervisor review requested" done>
              <p className="text-sm text-muted" data-testid="demo-review-note">
                Requested. In supervised autonomy, a separate reviewer decides — an author
                cannot approve their own output. That separation is the guarantee, not a
                limitation.
              </p>
              <p className="mt-2 text-sm">
                <Link
                  to="/matters/$slug/$tab"
                  params={{ slug: handles.matter_slug, tab: "approvals" }}
                  className="underline underline-offset-4 hover:text-ink"
                >
                  Open Approvals
                </Link>{" "}
                to record a decision as a reviewer.
              </p>
            </Step>
          )}

          {/* Step 4 — the trail */}
          {phase.step === "reviewed" && (
            <Step n={4} title="See the whole chain" done>
              <p className="text-sm text-muted">
                The Record reconstructs everything that just happened: skill run,
                model called, artifact written, review requested.
              </p>
              <p className="mt-3">
                <Link
                  to="/matters/$slug/audit"
                  params={{ slug: handles.matter_slug }}
                  search={{ invocation_id: phase.invocationId }}
                  className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
                  data-testid="demo-open-trail"
                >
                  Open Record →
                </Link>
              </p>
            </Step>
          )}
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-rule bg-paper p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span
          className={
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] " +
            (done ? "bg-ink text-paper" : "border border-rule text-muted")
          }
        >
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-2 pl-7">{children}</div>
    </section>
  );
}
