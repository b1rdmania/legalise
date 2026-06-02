/**
 * Four-question proof drawer for the guided demo (`/demo-loop`).
 *
 * Opens from TrustReviewCard. The four-question shape is the regulator's
 * lens: What did it see? Under what protection? What did it produce? Who
 * remains accountable? — sharper than dumping audit rows.
 *
 * Honesty boundary: header is "Proof record" not "Verified proof". Where
 * a fact is not available client-side (input text pre-run, source anchors,
 * etc.), the drawer says "Recorded in Record" rather than
 * fabricating data. The deeper substrate path stays a click away via
 * "Open full Record".
 *
 * Scoped narrowly to /demo-loop. Matter-shell rollout is a separate later
 * call — when that lands, watch out for the supervisor-review vs
 * professional-sign-off distinction (see memory).
 */

import { Link } from "@tanstack/react-router";
import type { ArtifactRead, GuidedDemoHandles } from "../lib/api";

type ProofDrawerProps = {
  open: boolean;
  onClose: () => void;
  handles: GuidedDemoHandles;
  artifact?: ArtifactRead;
  invocationId?: string;
  reviewRequested?: boolean;
};

export function ProofDrawer({
  open,
  onClose,
  handles,
  artifact,
  invocationId,
  reviewRequested,
}: ProofDrawerProps) {
  if (!open) return null;

  const payload = (artifact?.payload ?? {}) as Record<string, unknown>;
  const inputText = typeof payload.input === "string" ? (payload.input as string) : null;
  const outputText = typeof payload.output === "string" ? (payload.output as string) : null;
  const outputPreview = outputText
    ? outputText.length > 280
      ? outputText.slice(0, 280).trimEnd() + "…"
      : outputText
    : null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/40"
        aria-hidden="true"
        data-testid="proof-drawer-backdrop"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Proof record"
        className="fixed top-0 right-0 z-50 h-screen w-[460px] max-w-full bg-paper border-l border-rule p-6 overflow-y-auto"
        data-testid="proof-drawer"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted mb-1">
              Proof record
            </div>
            <h3 className="text-lg font-bold text-ink leading-tight">{handles.matter_title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-2"
            data-testid="proof-drawer-close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <Section title="What did it see?">
          <Fact label="Document" value={handles.document_filename} mono />
          {inputText ? (
            <Fact label="Input" value={inputText} />
          ) : (
            <Fact
              label="Input"
              value="Recorded in Record once the skill has been run."
              muted
            />
          )}
          <Fact label="Source anchors" value="Recorded in Record." muted />
        </Section>

        <Section title="Under what protection?">
          <Fact
            label="Model"
            value={`${handles.model_id} — keyless demo provider; no API key in scope.`}
          />
          <Fact
            label="Permission"
            value="Matter-scoped. The skill is enabled only on this demo matter."
          />
          <Fact
            label="Privilege control"
            value="Cleared. Synthetic content; no real party data."
          />
          <Fact
            label="Audit"
            value="Every read, model call, and write is recorded in Record."
          />
        </Section>

        <Section title="What did it produce?">
          {artifact ? (
            <>
              <Fact label="Artifact kind" value={artifact.kind} mono />
              <Fact
                label="Output"
                value={outputPreview ?? "Recorded in Record."}
              />
              <Fact
                label="Source visibility"
                value="Rendered above in the page; full payload available via the Record."
              />
            </>
          ) : (
            <Fact label="Status" value="Run not yet executed." muted />
          )}
        </Section>

        <Section title="Who remains accountable?">
          <Fact label="Author" value="The signed-in user who triggered the run." />
          <Fact
            label="Self-approval"
            value="Forbidden by the runtime. Authors cannot decide their own review."
          />
          {reviewRequested ? (
            <Fact
              label="Review"
              value="Requested. A separate reviewer must decide before output is treated as final."
            />
          ) : (
            <Fact label="Review" value="Not yet requested." muted />
          )}
          <Fact
            label="Sign-off"
            value="Output remains draft until a reviewer signs off."
          />
        </Section>

        {invocationId && (
          <p className="mt-6 border-t border-rule pt-4">
            <Link
              to="/matters/$slug/audit"
              params={{ slug: handles.matter_slug }}
              search={{ invocation_id: invocationId }}
              className="inline-flex items-center text-sm underline underline-offset-4 hover:text-ink"
              data-testid="proof-drawer-open-trail"
            >
              Open full Record &rarr;
            </Link>
          </p>
        )}
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h4 className="text-sm font-semibold text-ink mb-2">{title}</h4>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function Fact({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-xs">
      <dt className="text-muted">{label}</dt>
      <dd
        className={
          (mono ? "font-mono " : "") +
          (muted ? "text-muted" : "text-ink") +
          " break-words"
        }
      >
        {value}
      </dd>
    </div>
  );
}
