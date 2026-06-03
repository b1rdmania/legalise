import { diff_match_patch as DiffMatchPatch } from "diff-match-patch";

import type { DocumentVersionRead } from "../../lib/api";

const dmp = new DiffMatchPatch();

type DiffPart = {
  type: "same" | "insert" | "delete";
  text: string;
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

function versionLabel(version: DocumentVersionRead | null): string {
  if (!version) return "Extracted text";
  return `v${version.version_number}`;
}

export function VersionDiff({
  before,
  after,
}: {
  before: { version: DocumentVersionRead | null; text: string };
  after: { version: DocumentVersionRead; text: string };
}) {
  const parts = buildVersionDiff(before.text, after.text);
  const changed = parts.some((part) => part.type !== "same");

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
          {changed ? "Changes shown" : "No text changes"}
        </span>
      </div>
      <div className="mt-4 max-h-[360px] overflow-auto border border-rule bg-paper p-4 text-sm leading-7">
        {parts.map((part, index) => {
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
        })}
      </div>
    </section>
  );
}
