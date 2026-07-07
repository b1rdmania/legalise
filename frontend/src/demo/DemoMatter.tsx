// Read-only demo workspace for `/demo`. Mirrors the matter shell but
// feeds every surface from the hard-coded snapshot. Zero backend calls.

import { useEffect, useMemo, useState } from "react";
import type { MatterDocument } from "../lib/api";
import { isPublicRoute, navigate, useRoute } from "../lib/route";
import { CertCard, CertEyebrow, LedgerLine, LedgerRow, SectionRule } from "../ui/certificate";
import { isTabKey, sidebarActiveFor, type TabKey } from "../matter/tabs/types";
import { SidebarView, NavIcon, type RailItem } from "../ui/SidebarView";
import { ChronologyTab } from "../matter/tabs/ChronologyTab";
import { AuditTab } from "../matter/tabs/AuditTab";
import { AssistantTab } from "../matter/tabs/AssistantTab";
import { DEMO_SNAPSHOT } from "./snapshot";
import { DemoSignedOutput } from "./DemoSignedOutput";
import { postureDot, postureLabel } from "../lib/posture";

const DEMO_NAV: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "assistant", label: "Chat" },
  { key: "documents", label: "Documents" },
  { key: "workflows", label: "Skills" },
];

// Posture indicator dot (matches ui/Sidebar.tsx). Semantic, not chrome.
// Two user-facing states (src/lib/posture.ts): Active / Paused.
function posturePill(p: string): { label: string; dot: string } {
  return { label: postureLabel(p), dot: postureDot(p) };
}

export type SearchSegment = { text: string; match: boolean };

export function splitSearchMatches(text: string, query: string): SearchSegment[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: SearchSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerNeedle, cursor);
    if (index === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), match: false });
    }
    segments.push({
      text: text.slice(index, index + needle.length),
      match: true,
    });
    cursor = index + needle.length;
  }
  return segments.length ? segments : [{ text, match: false }];
}

export function demoDocumentMatches(doc: MatterDocument, query: string): boolean {
  const target = query.trim().toLowerCase();
  if (!target) return true;
  return [
    doc.filename,
    doc.tag ?? "",
    doc.sha256,
    doc.from_disclosure ? "disclosure cpr 31" : "upload",
    doc.mime_type,
  ]
    .join(" ")
    .toLowerCase()
    .includes(target);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

// The demo gains two surfaces the workspace tabs don't have: the cause
// list (P33) and the signed output (P34), so the loop closes on a
// signature, not just a summary.
type DemoTab = TabKey | "matters" | "signed";

function demoTabFromRoute(routeTab: string | undefined): DemoTab | null {
  if (routeTab === "matters") return "matters";
  if (routeTab === "signed") return "signed";
  if (routeTab && isTabKey(routeTab)) return routeTab as TabKey;
  return null;
}

export function DemoMatter() {
  const route = useRoute();
  const initialTab: DemoTab =
    route.name === "demoDocument"
      ? "documents"
      : (route.name === "demo" && demoTabFromRoute(route.tab)) || "assistant";
  const [tab, setTab] = useState<DemoTab>(initialTab);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inspectedDocId, setInspectedDocId] = useState<string | null>(null);

  useEffect(() => {
    if (route.name === "demoDocument") {
      setTab("documents");
    } else if (route.name === "demo" && route.tab) {
      const next = demoTabFromRoute(route.tab);
      if (next) setTab(next);
    } else if (route.name === "demo" && !route.tab) {
      setTab("assistant");
    }
  }, [route]);

  // Demo route is public - make sure no protected-route redirect interferes.
  useEffect(() => {
    if ((route.name === "demo" || route.name === "demoDocument") && !isPublicRoute(route)) {
      // Defensive - should never hit; the route allowlist already covers it.
    }
  }, [route]);

  const setTabAndHash = (next: DemoTab) => {
    setTab(next);
    setMobileNavOpen(false);
    const target = `/demo/${next}`;
    if (target !== window.location.pathname) navigate(target);
  };

  const noop = () => undefined;

  const matter = DEMO_SNAPSHOT.matter;
  const documents = DEMO_SNAPSHOT.documents;

  const [showSoF, setShowSoF] = useState(false);

  // P33: the rail reads like the real workspace — a Matters section
  // above the open matter. Settings / Help still stay out (they
  // dead-end at the sign-in wall); one quiet CTA instead.
  const globalItems: RailItem[] = [
    {
      key: "matters",
      label: "Matters",
      icon: <NavIcon name="matters" />,
      active: tab === "matters",
      onSelect: () => setTabAndHash("matters"),
    },
  ];
  const matterItems: RailItem[] = [
    ...DEMO_NAV.map((t) => ({
      key: t.key,
      label: t.label,
      icon: <NavIcon name={t.key} />,
      active: tab !== "matters" && sidebarActiveFor(tab as TabKey) === t.key,
      onSelect: () => setTabAndHash(t.key),
    })),
  ];

  return (
    <>
      <div className="min-h-screen md:h-screen bg-canvas text-ink md:flex md:gap-3 md:p-3 md:overflow-hidden">
        <SidebarView
          brandHref="/"
          globalItems={globalItems}
          matterTitle={matter.title}
          matterPosture={posturePill(matter.privilege_posture)}
          matterItems={matterItems}
          matterFooter={
            <a
              href="/auth/signup"
              className="mx-2 mt-3 block px-3 text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal transition-colors"
            >
              Create a workspace →
            </a>
          }
          utilItems={[]}
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />
        <div className="md:hidden sticky top-0 z-30 flex items-center h-[56px] px-4 bg-canvas border-b border-rule">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <main className="min-h-screen bg-panel md:min-h-0 md:flex-1 md:min-w-0 md:h-full md:rounded-panel md:shadow-panel md:overflow-y-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
            {tab === "matters" && route.name !== "demoDocument" && (
              <DemoMattersTab onOpenKhan={() => setTabAndHash("assistant")} />
            )}
            {tab === "assistant" && (
              <div className="space-y-6">
                <p className="mx-auto w-full max-w-[760px] text-[13px] text-muted" data-testid="demo-readonly-strip">
                  Public demo · read-only Khan v Acme ·{" "}
                  <a href="/auth/signup" className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal">
                    create a workspace
                  </a>{" "}
                  to run it yourself.
                </p>
                <AssistantTab
                  matter={matter}
                  docs={documents}
                  chronology={DEMO_SNAPSHOT.chronology.events}
                  auditCount={DEMO_SNAPSHOT.audit.length}
                  workflowsGrantedCount={4}
                  setTabAndHash={setTabAndHash}
                  initialMessages={DEMO_SNAPSHOT.assistantMessages}
                  disabled
                  showPostureInPulse={false}
                  showDisabledFooter={false}
                  showContextRail={false}
                  onDisabledAction={() => setTabAndHash("workflows")}
                  onOpenSignedOutput={() => setTabAndHash("signed")}
                  onDocumentChip={(documentId) =>
                    navigate(`/demo/documents/${encodeURIComponent(documentId)}`)
                  }
                />
              </div>
            )}
            {route.name === "demoDocument" ? (
              <DemoDocumentReader documentId={route.documentId} docs={documents} />
            ) : tab === "documents" && (
              <DemoDocumentsTab
                docs={documents}
                inspectedDocId={inspectedDocId}
                onInspect={setInspectedDocId}
              />
            )}
            {tab === "chronology" && (
              <ChronologyTab
                chron={DEMO_SNAPSHOT.chronology}
                showSoF={showSoF}
                setShowSoF={setShowSoF}
                onConfirmGate={noop}
              />
            )}
            {tab === "workflows" && (
              <DemoWorkflowsTab onOpen={setTabAndHash} />
            )}
            {tab === "signed" && route.name !== "demoDocument" && (
              <DemoSignedOutput />
            )}
            {tab === "audit" && <AuditTab audit={DEMO_SNAPSHOT.audit} matter={matter} />}
        </main>
      </div>
    </>
  );
}

// -- Matters (the cause list, demo variant) ---------------------------------
// The rail reads like a real workspace: several matters, one open. The
// other entries expand in place — honest detail without pretending the
// demo follows more than one matter end to end.

const OTHER_MATTERS: Array<{
  title: string;
  matter_type: string;
  opened: string;
  posture: "Active" | "Paused";
  note: string;
}> = [
  {
    title: "Reyes v Brightline Logistics Ltd",
    matter_type: "employment_tribunal",
    opened: "2026-03-18",
    posture: "Paused",
    note: "Paused for without-prejudice talks. The gate is holding model access closed; every blocked attempt would land on this matter's record.",
  },
  {
    title: "Okafor — director's loan account dispute",
    matter_type: "civil",
    opened: "2026-05-07",
    posture: "Active",
    note: "Documents uploaded, chronology built, letter before action in draft awaiting review and sign-off.",
  },
];

function DemoMattersTab({ onOpenKhan }: { onOpenKhan: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="max-w-5xl">
      <SectionRule label="The cause list" right="3 matters" />
      <div className="mt-5">
        <LedgerLine
          index={1}
          label="employment_tribunal"
          right={
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink">
              Active · open
            </span>
          }
        >
          <button
            type="button"
            onClick={onOpenKhan}
            className="text-left text-sm text-ink underline-offset-4 hover:text-seal hover:underline"
          >
            Khan v Acme Trading Ltd
          </button>
        </LedgerLine>
        {OTHER_MATTERS.map((m, i) => (
          <div key={m.title}>
            <LedgerLine
              index={i + 2}
              label={m.matter_type}
              right={
                <span
                  className={
                    "text-[10px] uppercase tracking-[0.18em] " +
                    (m.posture === "Paused" ? "text-seal" : "text-muted")
                  }
                >
                  {m.posture}
                </span>
              }
            >
              <button
                type="button"
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="text-left text-sm text-ink underline-offset-4 hover:text-seal hover:underline"
              >
                {m.title}
              </button>
            </LedgerLine>
            {expanded === i && (
              <div className="border-b border-rule/60 bg-wash px-14 py-3 text-sm leading-relaxed text-prose">
                {m.note}
                <span className="mt-1 block text-xs text-muted">
                  Opened {m.opened}. The public demo follows Khan v Acme end to
                  end; this matter is here so the workspace reads true.
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-8 border-t border-rule pt-4 text-xs text-muted">
        In a workspace this list is yours.{" "}
        <a
          href="/auth/signup"
          className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          Create a workspace
        </a>{" "}
        to open your own matters.
      </p>
    </div>
  );
}

function DemoWorkflowsTab({
  onOpen,
}: {
  onOpen: (tab: TabKey) => void;
}) {
  const workflows: Array<{
    key: TabKey;
    title: string;
    body: string;
    reads: string;
    writes: string;
    last: string;
    track: string;
  }> = [
    {
      key: "assistant",
      title: "Summarise a document",
      body: "Plain-English summary of a matter document, run from chat with sources cited.",
      reads: "dismissal letter",
      writes: "summary card",
      last: "Ready in demo",
      track: "Signed 14 · with observations 3 · refused 1",
    },
    {
      key: "assistant",
      title: "Anonymise a document",
      body: "PII detection and redaction with a reviewable mapping.",
      reads: "witness statement",
      writes: "redacted copy",
      last: "Preview available",
      track: "Signed 6 · with observations 1 · refused 0",
    },
  ];

  return (
    <div className="max-w-5xl">
      <SectionRule label="Skills in this matter" right="2 admitted" />
      <p className="mt-5 max-w-xl text-sm leading-relaxed text-prose">
        A skill is a small piece of legal work: review an NDA, test a claim,
        draft a letter. Each one declares what it may read and write before
        it is allowed to run, and everything it does lands on the matter
        record. These two are admitted on Khan v Acme — run either from
        chat.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {workflows.map((w, i) => (
          <CertCard key={w.title}>
            <CertEyebrow
              left={`Skill ${String(i + 1).padStart(2, "0")}`}
              right="Ready"
            />
            <h3 className="mt-3 text-[22px] leading-tight tracking-tight2 text-ink">
              {w.title}
            </h3>
            <p className="mt-1 text-xs text-muted">{w.body}</p>
            <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[11px] text-muted">
              <LedgerRow label="Reads">{w.reads}</LedgerRow>
              <LedgerRow label="Writes">{w.writes}</LedgerRow>
              <LedgerRow label="Record">{w.last}</LedgerRow>
            </dl>
            {/* P34: what sign-off did with this skill's output so far. */}
            <dl
              className="mt-3 space-y-1 border-t border-rule pt-3 text-[11px] text-muted"
              data-testid="demo-skill-track-record"
            >
              <LedgerRow label="Track record" tone="ink">
                {w.track}
              </LedgerRow>
            </dl>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted">
              Seeded demo record
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onOpen(w.key)}
                className="bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-seal transition-colors"
              >
                Open in chat
              </button>
            </div>
          </CertCard>
        ))}
      </div>

      <div className="mt-10">
        <SectionRule label="How a skill arrives" right="Admission" />
        <div className="mt-4">
          <LedgerLine index={1} label="Import">
            Point the workspace at any public GitHub repo with a SKILL.md, or
            pick one from the Lawve catalogue. It is read at a pinned commit.
          </LedgerLine>
          <LedgerLine index={2} label="Admission">
            A live scan checks the manifest, permissions, and source, then
            halts at one human decision: approve and enable, or refuse.
          </LedgerLine>
          <LedgerLine index={3} label="Run">
            Enable it on a matter and run it from chat. Output, sources, and
            sign-off land on the record.
          </LedgerLine>
        </div>
        <p className="mt-6 text-sm text-prose">
          <a
            href="/skills"
            className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            Browse the public skill library →
          </a>
        </p>
      </div>
    </div>
  );
}

// -- Documents (demo variant) ----------------------------------------------
// Mirrors the live document-library shape without mutation controls.

function DemoDocumentsTab({
  docs,
  inspectedDocId,
  onInspect,
}: {
  docs: MatterDocument[];
  inspectedDocId: string | null;
  onInspect: (id: string) => void;
}) {
  const inspectedDoc = docs.find((doc) => doc.id === inspectedDocId) ?? docs[0];
  const [fileQuery, setFileQuery] = useState("");
  const [previewQuery, setPreviewQuery] = useState("");

  useEffect(() => {
    setPreviewQuery("");
  }, [inspectedDoc?.id]);

  if (!inspectedDoc) {
    return (
      <div className="max-w-5xl rounded-card border border-rule bg-paper p-5 text-sm text-muted">
        No demo documents are available.
      </div>
    );
  }

  const extractedText = demoDocumentExtract(inspectedDoc);
  const previewSegments = splitSearchMatches(extractedText, previewQuery);
  const previewMatchCount = previewQuery.trim()
    ? previewSegments.filter((segment) => segment.match).length
    : 0;
  const filteredDocs = docs.filter((doc) => demoDocumentMatches(doc, fileQuery));

  return (
    <div className="max-w-6xl">
      <SectionRule label="Documents in this matter" />

      <div className="mt-5 grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div>
          <label className="block text-xs text-muted">
            <span className="sr-only">Search demo documents</span>
            <input
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder="Search files"
              className="h-9 w-full border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
              data-testid="demo-document-list-search"
            />
          </label>
          <p className="mt-2 text-xs text-muted" data-testid="demo-document-list-count">
            Showing {filteredDocs.length} of {docs.length} files.
          </p>
          <div className="mt-1">
            {filteredDocs.map((d, i) => {
              const active = d.id === inspectedDoc.id;
              return (
                <div key={d.id} className={active ? "bg-wash" : ""}>
                  <LedgerLine
                    index={i + 1}
                    label={`${formatBytes(d.size_bytes)} · ${d.uploaded_at.slice(0, 10)}`}
                    right={
                      <a
                        href={`/demo/documents/${encodeURIComponent(d.id)}`}
                        className="text-sm text-muted hover:text-seal"
                      >
                        Open →
                      </a>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onInspect(d.id)}
                      className="block w-full truncate text-left text-sm text-ink hover:text-seal"
                    >
                      {d.filename}
                    </button>
                  </LedgerLine>
                </div>
              );
            })}
            {filteredDocs.length === 0 && (
              <p className="px-4 py-5 text-sm text-muted">
                No demo files match this search.
              </p>
            )}
            {/* P34: the signed output lives with the files — work the
                matter produced, with a name behind it. */}
            <LedgerLine
              index={docs.length + 1}
              label="signed output"
              right={
                <a
                  href="/demo/signed"
                  className="text-sm text-muted hover:text-seal"
                >
                  Open →
                </a>
              }
              testid="demo-files-signed-output"
            >
              <a
                href="/demo/signed"
                className="block w-full truncate text-left text-sm text-ink hover:text-seal"
              >
                Summary of witness-statement-khan.docx — signed by R. Patel
              </a>
            </LedgerLine>
          </div>
        </div>

        <section className="min-h-[620px] rounded-card border border-rule bg-paper">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Document reader
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
                {inspectedDoc.filename}
              </h3>
              <p className="mt-1 text-xs text-muted">
                Extracted text preview. Skills and source chips point back to this reader.
              </p>
            </div>
            <a
              href={`/demo/documents/${encodeURIComponent(inspectedDoc.id)}`}
              className="rounded-item border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-seal hover:border-seal"
            >
              Open full reader
            </a>
          </div>
          <div className="border-b border-rule bg-paper-sunken px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="min-w-[220px] text-xs text-muted">
                <span className="sr-only">Search selected demo document</span>
                <input
                  value={previewQuery}
                  onChange={(event) => setPreviewQuery(event.target.value)}
                  placeholder="Search this document"
                  className="h-9 w-full rounded-item border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
                  data-testid="demo-document-preview-search"
                />
              </label>
              {previewQuery.trim() && (
                <p className="text-xs text-muted" data-testid="demo-document-preview-search-count">
                  {previewMatchCount
                    ? `${previewMatchCount} match${previewMatchCount === 1 ? "" : "es"}`
                    : "No matches"}
                </p>
              )}
            </div>
          </div>
          <div
            className="px-6 py-6 text-[15px] leading-8 text-ink whitespace-pre-wrap"
            data-testid="demo-document-preview-text"
          >
            {previewSegments.map((segment, index) =>
              segment.match ? (
                <mark
                  key={`${segment.text}-${index}`}
                  className="bg-[#FFF4B8] px-0.5"
                  data-testid="demo-document-preview-search-match"
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={`${index}-${segment.text.slice(0, 8)}`}>{segment.text}</span>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function DemoDocumentReader({
  documentId,
  docs,
}: {
  documentId: string;
  docs: MatterDocument[];
}) {
  const doc = docs.find((d) => d.id === documentId);
  const [query, setQuery] = useState("");
  const extractedText = doc ? demoDocumentExtract(doc) : "";
  const searchSegments = useMemo(
    () => splitSearchMatches(extractedText, query),
    [extractedText, query],
  );
  const matchCount = query.trim()
    ? searchSegments.filter((segment) => segment.match).length
    : 0;

  if (!doc) {
    return (
      <div className="max-w-4xl rounded-card border border-rule bg-paper p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Document
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight2 text-ink">
          Demo document not found
        </h1>
        <a
          href="/demo/documents"
          className="mt-4 inline-flex text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          ← Back to demo documents
        </a>
      </div>
    );
  }

  // P29 §3: the reading surface, stripped to the P25 anatomy — back link,
  // title, one meta line, the document, facts as ledger rows at the foot.
  // No workbench panel, no lecture list, no chip salad.
  return (
    <div className="mx-auto max-w-[820px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <a
          href="/demo/documents"
          className="text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          ← Files
        </a>
        <label className="min-w-[200px] text-xs text-muted">
          <span className="sr-only">Search document</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this document"
            className="h-9 w-full rounded-item border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
            data-testid="demo-document-search"
          />
        </label>
      </div>

      <header>
        <h1 className="text-3xl font-semibold tracking-tight2 text-ink sm:text-4xl">
          {doc.filename}
        </h1>
        <p className="mt-2 text-xs text-muted">
          {[
            doc.tag,
            doc.from_disclosure ? "CPR 31 disclosure" : "uploaded",
            formatBytes(doc.size_bytes),
            doc.uploaded_at.slice(0, 10),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {query.trim() && (
          <p className="mt-2 text-xs text-muted" data-testid="demo-document-search-count">
            {matchCount
              ? `${matchCount} match${matchCount === 1 ? "" : "es"}`
              : "No matches"}
          </p>
        )}
      </header>

      <div
        className="mt-8 border-t border-rule pt-8 text-[16px] leading-8 text-ink whitespace-pre-wrap"
        data-testid="demo-document-reader"
      >
        {searchSegments.map((segment, index) =>
          segment.match ? (
            <mark
              key={`${segment.text}-${index}`}
              className="bg-[#FFF4B8] px-0.5"
              data-testid="demo-document-search-match"
            >
              {segment.text}
            </mark>
          ) : (
            <span key={`${index}-${segment.text.slice(0, 8)}`}>{segment.text}</span>
          ),
        )}
      </div>

      <footer className="mt-12 border-t border-rule pt-4">
        <dl className="space-y-1 text-[11px] text-muted">
          <LedgerRow label="Type">
            {doc.mime_type.includes("wordprocessingml")
              ? "Word document"
              : doc.mime_type === "application/pdf"
                ? "PDF"
                : doc.mime_type}
          </LedgerRow>
          <LedgerRow label="Uploaded">
            {doc.uploaded_at.replace("T", " ").slice(0, 16)}
          </LedgerRow>
          <LedgerRow label="SHA-256">
            <span className="tech-token">{doc.sha256.slice(0, 16)}…</span>
          </LedgerRow>
        </dl>
        <p className="mt-4 text-xs text-muted">
          In the working product this surface carries the original file, edit
          versions, redlines, and record links.
        </p>
      </footer>
    </div>
  );
}

function demoDocumentExtract(doc: MatterDocument): string {
  if (doc.filename.includes("dismissal")) {
    return [
      "ACME TRADING LTD\nUnit 4, Riverside Industrial Estate, Leeds LS10 1AB",
      "12 March 2026\n\nMs Jasmine Khan\n[address withheld in this demo]",
      "Dear Ms Khan,",
      "RE: TERMINATION OF EMPLOYMENT",
      "I am writing to confirm the outcome of the disciplinary hearing held on 10 March 2026. The panel found that your conduct in publishing material on social media on 5 March 2026 amounted to a serious breach of the Company's Social Media and Communications Policy (section 4.2).",
      "The Company has decided that your employment will terminate with effect from 12 March 2026. You will be paid in lieu of your notice period.",
      "The disciplinary meeting was chaired by Mr D. Caldwell, Warehouse Operations Manager. The panel considered your written representations and the investigation report dated 6 March 2026.",
      "You have the right to appeal this decision in writing within five working days.",
      "Yours sincerely,\nHR Department\nAcme Trading Ltd",
    ].join("\n\n");
  }
  if (doc.filename.includes("witness")) {
    return [
      "IN THE EMPLOYMENT TRIBUNAL\nCASE NO: 2406432/2026\n\nBETWEEN: JASMINE KHAN (Claimant) and ACME TRADING LTD (Respondent)",
      "WITNESS STATEMENT OF JASMINE KHAN",
      "1. I make this statement from my own knowledge save where otherwise stated.",
      "2. I was employed by the Respondent from 8 November 2022 until my dismissal on 12 March 2026, most recently as a warehouse team coordinator. My disciplinary record was clean throughout.",
      "3. On 29 January 2026 I raised a written grievance concerning the conduct of my line manager, Mr Caldwell, toward female members of the warehouse team. HR acknowledged the grievance on 18 February 2026 and appointed Mr Caldwell's own department to investigate it.",
      "4. The Instagram post relied on by the Respondent was made on 5 March 2026 from my personal account, outside working hours. The account is private, with an audience of 47 approved followers. None of them are customers, suppliers, or people named in the post. The post did not identify the Respondent.",
      "5. The disciplinary meeting on 10 March 2026 was chaired by Mr Caldwell — the manager who was the subject of my grievance six weeks earlier.",
      "I believe the facts stated in this witness statement are true.",
    ].join("\n\n");
  }
  return [
    "MUTUAL NON-DISCLOSURE AGREEMENT",
    "This Agreement is made between Acme Trading Ltd and North Mill Consulting Limited (each a \"Party\").",
    "1. CONFIDENTIAL INFORMATION. Each Party may disclose to the other information relating to its business, products, customers, and operations. All such information is \"Confidential Information\".",
    "2. OBLIGATIONS. Each Party shall hold the other's Confidential Information in strict confidence. The obligations in this clause survive termination of this Agreement indefinitely.",
    "3. INDEMNITY. Each Party shall indemnify the other against all losses, costs, and claims howsoever arising in connection with any breach of this Agreement, without limit.",
    "4. DATA PROTECTION. Each Party confirms it complies with applicable data protection law.",
    "5. TERM. This Agreement runs for three years from the date of signature.",
    "[No governing law or jurisdiction clause appears in the document.]",
  ].join("\n\n");
}
