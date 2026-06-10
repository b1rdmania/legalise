import { diff_match_patch as DiffMatchPatch } from "diff-match-patch";

import type { DocumentVersionRead } from "../../lib/api";

const dmp = new DiffMatchPatch();

type DiffPart = {
  type: "same" | "insert" | "delete";
  text: string;
};

type DiffSummary = {
  insertedChars: number;
  deletedChars: number;
  unchangedChars: number;
  changed: boolean;
};

export function buildVersionDiff(before: string, after: string): DiffPart[] {
  const diffs = dmp.diff_main(before, after);
  dmp.diff_cleanupSemantic(diffs);
  return diffs
    .filter(([, text]) => text.length > 0)
    .map(([op, text]) => ({
      type: op === 1 ? "insert" : op === -1 ? "delete" : "same",
      text,
    }));
}

export function buildVersionDiffSummary(parts: DiffPart[]): DiffSummary {
  return parts.reduce<DiffSummary>(
    (summary, part) => {
      if (part.type === "insert") {
        summary.insertedChars += part.text.length;
        summary.changed = true;
      } else if (part.type === "delete") {
        summary.deletedChars += part.text.length;
        summary.changed = true;
      } else {
        summary.unchangedChars += part.text.length;
      }
      return summary;
    },
    { insertedChars: 0, deletedChars: 0, unchangedChars: 0, changed: false },
  );
}

function versionLabel(version: DocumentVersionRead | null): string {
  if (!version) return "Extracted text";
  return `v${version.version_number}`;
}

function renderPlainText(text: string) {
  return text || "No text captured for this side.";
}

function renderInlineParts(parts: DiffPart[]) {
  return parts.map((part, index) => {
    if (part.type === "insert") {
      return (
        <ins
          key={`${part.type}-${index}`}
          className="bg-green-100 px-0.5 text-green-950 no-underline"
        >
          {part.text}
        </ins>
      );
    }
    if (part.type === "delete") {
      return (
        <del
          key={`${part.type}-${index}`}
          className="bg-red-100 px-0.5 text-red-950"
        >
          {part.text}
        </del>
      );
    }
    return <span key={`${part.type}-${index}`}>{part.text}</span>;
  });
}

export function VersionDiff({
  before,
  after,
}: {
  before: { version: DocumentVersionRead | null; text: string };
  after: { version: DocumentVersionRead; text: string };
}) {
  const parts = buildVersionDiff(before.text, after.text);
  const summary = buildVersionDiffSummary(parts);

  return (
    <section className="mt-5 border border-rule bg-paper-sunken p-4" data-testid="version-diff">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Compare version</h3>
          <p className="mt-1 text-xs text-muted">
            {versionLabel(before.version)} → {versionLabel(after.version)}
          </p>
        </div>
        <span className="border border-rule bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-track2 text-muted">
          {summary.changed ? "Changes shown" : "No text changes"}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="border border-rule bg-paper p-3">
          <dt className="tech-token uppercase tracking-track2 text-muted">Added</dt>
          <dd className="mt-1 text-sm font-semibold text-green-900">
            {summary.insertedChars.toLocaleString()} chars
          </dd>
        </div>
        <div className="border border-rule bg-paper p-3">
          <dt className="tech-token uppercase tracking-track2 text-muted">Removed</dt>
          <dd className="mt-1 text-sm font-semibold text-red-900">
            {summary.deletedChars.toLocaleString()} chars
          </dd>
        </div>
        <div className="border border-rule bg-paper p-3">
          <dt className="tech-token uppercase tracking-track2 text-muted">Unchanged</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">
            {summary.unchangedChars.toLocaleString()} chars
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="border border-rule bg-paper">
          <div className="border-b border-rule px-3 py-2 text-xs font-semibold text-muted">
            Before · {versionLabel(before.version)}
          </div>
          <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-7 text-ink">
            {renderPlainText(before.text)}
          </pre>
        </div>
        <div className="border border-rule bg-paper">
          <div className="border-b border-rule px-3 py-2 text-xs font-semibold text-muted">
            After · {versionLabel(after.version)}
          </div>
          <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-7 text-ink">
            {renderPlainText(after.text)}
          </pre>
        </div>
      </div>

      <details className="mt-4 border border-rule bg-paper">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink">
          Inline redline
        </summary>
        <div className="max-h-[360px] overflow-auto border-t border-rule p-4 text-sm leading-7">
          {renderInlineParts(parts)}
        </div>
      </details>
    </section>
  );
}
