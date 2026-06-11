/**
 * /matters/{slug}/lifecycle — Matter Lifecycle + Export UX v1.
 *
 * Makes the LMF substrate visible + safe: export the matter, close it
 * (non-destructive), or delete/purge it (destructive). Owner-only; the
 * endpoints enforce that. Poll-only job status (no SSE). No new audit
 * source — audit links filter the reconstruction on the real action
 * names. Order top-to-bottom: Export → Close → Delete (danger zone).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeMatter,
  createMatterExport,
  deleteMatter,
  getJob,
  getMatter,
  matterExportDownloadUrl,
  type JobRead,
  type Matter,
} from "../lib/api";
import { navigate } from "../lib/route";
import { ErrorCallout, LoadingLine, PageHeader } from "../ui/primitives";

const EXPORT_LS_KEY = (slug: string) => `legalise.export.${slug}`;
const POLL_MS = 3000;
const TERMINAL: ReadonlySet<string> = new Set(["succeeded", "failed", "cancelled"]);

export function MatterLifecycle({ slug }: { slug: string }) {
  const [matter, setMatter] = useState<Matter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMatter = useCallback(() => {
    getMatter(slug)
      .then(setMatter)
      .catch((e) => setError(String(e)));
  }, [slug]);

  useEffect(refreshMatter, [refreshMatter]);

  if (error && !matter) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <ErrorCallout message={error} />
      </div>
    );
  }
  if (!matter) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <LoadingLine label="loading matter" />
      </div>
    );
  }

  const isClosed = matter.status === "closed";

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="The matter's lifecycle"
        title="Working pack"
        subId={matter.slug}
        description="Download the governed matter record, then close or delete only if needed. Exporting the working pack is the normal final step."
      >
        <p className="mt-3 text-xs text-muted">
          Status: <span className="text-ink">{matter.status}</span>
        </p>
      </PageHeader>

      <ExportPanel slug={slug} />
      <ClosePanel slug={slug} status={matter.status} onClosed={refreshMatter} />
      <DeletePanel slug={slug} isClosed={isClosed} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ExportPanel({ slug }: { slug: string }) {
  const [job, setJob] = useState<JobRead | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const poll = useCallback(
    (jobId: string) => {
      getJob(slug, jobId)
        .then((j) => {
          setJob(j);
          if (!TERMINAL.has(j.status)) {
            timer.current = window.setTimeout(() => poll(jobId), POLL_MS);
          } else {
            try {
              window.localStorage.removeItem(EXPORT_LS_KEY(slug));
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => undefined);
    },
    [slug],
  );

  // Resume polling a previously-started export after a same-session reload.
  useEffect(() => {
    let resumeId: string | null = null;
    try {
      resumeId = window.localStorage.getItem(EXPORT_LS_KEY(slug));
    } catch {
      resumeId = null;
    }
    if (resumeId) poll(resumeId);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [slug, poll]);

  const start = async () => {
    setStarting(true);
    setErr(null);
    try {
      const j = await createMatterExport(slug);
      setJob(j);
      try {
        window.localStorage.setItem(EXPORT_LS_KEY(slug), j.id);
      } catch {
        /* ignore */
      }
      poll(j.id);
    } catch (e) {
      setErr(String(e));
    } finally {
      setStarting(false);
    }
  };

  const inProgress = job !== null && !TERMINAL.has(job.status);
  const succeeded = job?.status === "succeeded";
  const failed = job?.status === "failed" || job?.status === "cancelled";

  return (
    <section className="mt-8 rounded-card border border-rule p-5">
      <h2 className="text-sm uppercase tracking-widest text-muted">Export working pack</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
        <div>
          <p className="uppercase tracking-widest text-muted">Includes</p>
          <ul className="mt-1 list-disc pl-4 text-muted">
            <li>matter metadata</li>
            <li>uploaded documents + original files</li>
            <li>signed outputs + bytes</li>
            <li>review decisions</li>
            <li>audit reconstruction + raw audit</li>
            <li>README / manifest</li>
          </ul>
        </div>
        <div>
          <p className="uppercase tracking-widest text-muted">Not included</p>
          <ul className="mt-1 list-disc pl-4 text-muted">
            <li>legacy artefacts whose bytes predate object storage</li>
            <li>raw model prompts/responses beyond what audit records</li>
          </ul>
        </div>
      </div>

      {err && <div className="mt-3"><ErrorCallout message={err} compact /></div>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={starting || inProgress}
          className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-seal disabled:opacity-50"
          data-testid="start-export"
        >
          {starting ? "Starting…" : inProgress ? "Export running…" : "Start export"}
        </button>

        {job && (
          <span
            className="text-xs uppercase tracking-widest text-muted"
            data-testid="export-status"
          >
            {job.status}
          </span>
        )}

        {succeeded && (
          <a
            href={matterExportDownloadUrl(slug, job.id)}
            className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
            data-testid="download-export"
          >
            Download export
          </a>
        )}
      </div>

      {inProgress && (
        <p className="mt-2 text-xs text-muted">
          You can leave this page — the export continues in the background and
          the download appears here when it's ready.
        </p>
      )}
      {failed && (
        <p className="mt-2 text-sm text-seal">
          Export {job?.status}. {job?.error_message ?? ""}
        </p>
      )}

      <a
        href={`/matters/${encodeURIComponent(slug)}/audit?action=module.export.job.completed`}
        className="mt-3 inline-block text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
      >
        View export activity in Activity
      </a>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ClosePanel({
  slug,
  status,
  onClosed,
}: {
  slug: string;
  status: string;
  onClosed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const closed = status === "closed";

  const onClose = async () => {
    setBusy(true);
    setErr(null);
    try {
      await closeMatter(slug);
      onClosed();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-card border border-rule p-5">
      <h2 className="text-sm uppercase tracking-widest text-muted">Close matter</h2>
      <p className="mt-2 text-sm text-muted">
        Closing marks the matter inactive but is <span className="text-ink">non-destructive</span> —
        documents, artefacts, exports, and the audit trail are all retained,
        and the matter stays viewable. (Reopening isn't available in this
        version.)
      </p>
      {err && <div className="mt-3"><ErrorCallout message={err} compact /></div>}
      {closed ? (
        <p className="mt-3 text-sm text-ink" data-testid="already-closed">
          This matter is closed.
        </p>
      ) : (
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-3 inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink disabled:opacity-50"
          data-testid="close-matter"
        >
          {busy ? "Closing…" : "Close matter"}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function DeletePanel({ slug, isClosed }: { slug: string; isClosed: boolean }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const armed = confirmText.trim() === slug;

  const onDelete = async () => {
    if (!armed) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteMatter(slug);
      navigate("/matters");
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 border border-seal/40 bg-seal/5 p-5" data-testid="danger-zone">
      <h2 className="text-sm uppercase tracking-widest text-seal">Danger zone — delete</h2>
      <p className="mt-2 text-sm text-ink">
        Deleting permanently purges this matter's files from storage and removes
        it from your matters. This is irreversible and cannot be recovered.
      </p>
      <p className="mt-2 text-xs text-muted">
        Recommended: <span className="text-ink">export this matter first</span>{" "}
        (above) so you keep a copy. The audit trail records the deletion.
      </p>
      <ul className="mt-3 list-disc pl-5 text-xs text-muted">
        <li>All uploaded files + artefacts are deleted from object storage.</li>
        <li>The matter is removed from your matters list and cannot be reopened.</li>
        <li>Active jobs must finish first; deletion is refused while any are running.</li>
        <li>The matter's audit rows are retained as a tombstone, but its content is gone.</li>
      </ul>

      <label className="mt-4 block text-xs text-muted">
        Type the matter reference{" "}
        <span className="tech-token text-ink">{slug}</span> to confirm:
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2 tech-token text-sm text-ink"
          data-testid="delete-confirm-input"
          placeholder={slug}
        />
      </label>

      {err && <div className="mt-3"><ErrorCallout message={err} compact /></div>}

      <button
        type="button"
        onClick={onDelete}
        disabled={!armed || busy}
        className="mt-3 inline-flex items-center rounded-md bg-seal px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        data-testid="delete-matter"
      >
        {busy ? "Deleting…" : "Delete matter permanently"}
      </button>
      {!isClosed && (
        <p className="mt-2 text-[11px] text-muted">
          Tip: you can Close a matter instead of deleting it if you only want to
          mark it inactive.
        </p>
      )}
    </section>
  );
}
