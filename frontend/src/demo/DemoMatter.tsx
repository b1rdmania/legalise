// Read-only demo workspace for `/demo`. Mirrors the matter shell but
// feeds every surface from the hard-coded snapshot. Zero backend calls.

import { useEffect, useMemo, useState } from "react";
import type { MatterDocument } from "../lib/api";
import { isPublicRoute, navigate, useRoute } from "../lib/route";
import { Badge } from "../ui/primitives";
import { isTabKey, sidebarActiveFor, type TabKey } from "../matter/tabs/types";
import { SidebarView, NavIcon, type RailItem } from "../ui/SidebarView";
import { ChronologyTab } from "../matter/tabs/ChronologyTab";
import { AuditTab } from "../matter/tabs/AuditTab";
import { AssistantTab } from "../matter/tabs/AssistantTab";
import { DEMO_SNAPSHOT } from "./snapshot";

const DEMO_NAV: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "assistant", label: "Chat" },
  { key: "documents", label: "Files" },
  { key: "workflows", label: "Skills" },
];

// Posture indicator dot (matches ui/Sidebar.tsx). Semantic, not chrome.
const POSTURE_DOT: Record<string, { label: string; dot: string }> = {
  A_cleared: { label: "Cleared", dot: "#3F7A5A" },
  B_mixed: { label: "Mixed", dot: "#E67E22" },
  C_paused: { label: "Paused", dot: "#8B0000" },
};

const DEMO_READ_ONLY =
  "This demo is read-only. Open a preview to look around.";

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

export function DemoMatter() {
  const route = useRoute();
  const initialTab: TabKey =
    route.name === "demoDocument"
      ? "documents"
      : route.name === "demo" && route.tab && isTabKey(route.tab)
      ? (route.tab as TabKey)
      : "assistant";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [flash, setFlash] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inspectedDocId, setInspectedDocId] = useState<string | null>(null);

  useEffect(() => {
    if (route.name === "demoDocument") {
      setTab("documents");
    } else if (route.name === "demo" && route.tab && isTabKey(route.tab)) {
      setTab(route.tab as TabKey);
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

  const setTabAndHash = (next: TabKey) => {
    setTab(next);
    setMobileNavOpen(false);
    const target = `/demo/${next}`;
    if (target !== window.location.pathname) navigate(target);
  };

  const flashCta = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 4000);
  };

  const noop = () => undefined;

  const matter = DEMO_SNAPSHOT.matter;
  const documents = DEMO_SNAPSHOT.documents;

  const [showSoF, setShowSoF] = useState(false);

  const flashRO = () => flashCta(DEMO_READ_ONLY);
  const globalItems: RailItem[] = [
    { key: "matters", label: "Matters", icon: <NavIcon name="matters" />, onSelect: flashRO },
    { key: "library", label: "Skill library", icon: <NavIcon name="library" />, onSelect: flashRO },
  ];
  const matterItems: RailItem[] = [
    ...DEMO_NAV.map((t) => ({
      key: t.key,
      label: t.label,
      icon: <NavIcon name={t.key} />,
      active: sidebarActiveFor(tab) === t.key,
      onSelect: () => setTabAndHash(t.key),
    })),
  ];
  const utilItems: RailItem[] = [
    { key: "settings", label: "Settings", icon: <NavIcon name="settings" />, onSelect: flashRO },
    { key: "help", label: "Help", icon: <NavIcon name="help" />, onSelect: flashRO },
  ];

  return (
    <>
      {flash && <FlashCta message={flash} onClose={() => setFlash(null)} />}
      <div className="min-h-screen md:h-screen bg-canvas text-ink md:flex md:gap-3 md:p-3 md:overflow-hidden">
        <SidebarView
          globalItems={globalItems}
          matterTitle={matter.title}
          matterPosture={POSTURE_DOT[matter.privilege_posture]}
          matterItems={matterItems}
          utilItems={utilItems}
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
            {tab === "assistant" && (
              <div className="space-y-8">
                <DemoStartPanel
                  docs={documents}
                  auditCount={DEMO_SNAPSHOT.audit.length}
                  onOpen={setTabAndHash}
                  onRun={() => setTabAndHash("assistant")}
                />
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
            {tab === "audit" && <AuditTab audit={DEMO_SNAPSHOT.audit} matter={matter} />}
        </main>
      </div>
    </>
  );
}

function DemoStartPanel({
  docs,
  auditCount,
  onOpen,
  onRun,
}: {
  docs: MatterDocument[];
  auditCount: number;
  onOpen: (tab: TabKey) => void;
  onRun: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-[1220px] rounded-card border border-rule bg-paper p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Public demo
          </p>
          <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight2 text-ink sm:text-3xl">
            A legal project with documents, skills, and a record of what the AI did.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-prose">
            Read-only Khan v Acme. Open the project, inspect the documents,
            run a skill, review the output, and trace it in the Record.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onOpen("documents")}
              className="rounded-item border border-rule bg-paper px-3 py-2 text-sm font-medium text-ink hover:border-ink"
            >
              View documents
            </button>
            <button
              type="button"
              onClick={() => onOpen("workflows")}
              className="rounded-item border border-rule bg-paper px-3 py-2 text-sm font-medium text-ink hover:border-ink"
            >
              View skills
            </button>
            <button
              type="button"
              onClick={onRun}
              className="bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-black"
            >
              Open the chat
            </button>
          </div>
        </div>
        <div className="grid gap-3 text-sm">
          <DemoFact label="Documents" value={`${docs.length} loaded`} body="Matter evidence and drafts are in one folder." />
          <DemoFact label="Skills" value="Ready" body="Skills say what they read and what they produce." />
          <DemoFact label="Record" value={`${auditCount} entries`} body="AI work, source use, and sign-off stay traceable." />
        </div>
      </div>
    </section>
  );
}

function DemoFact({
  label,
  value,
  body,
}: {
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-card border border-rule bg-paper-sunken p-3">
      <div className="tech-token text-[10px] uppercase tracking-track2 text-muted">
        {label}
      </div>
      <div className="mt-1 font-semibold text-ink">{value}</div>
      <p className="mt-1 text-xs leading-5 text-muted">{body}</p>
    </div>
  );
}

function FlashCta({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="border-b border-rule bg-paper px-4 sm:px-6 lg:px-10 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="tech-token uppercase tracking-track2 text-[10px] font-bold text-ink">
        Demo
      </span>
      <span className="text-sm text-ink">{message}.</span>
      <button
        onClick={onClose}
        className="ml-auto text-xs text-muted hover:text-ink min-h-[32px] px-2"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
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
  }> = [
    {
      key: "assistant",
      title: "Summarise a document",
      body: "Plain-English summary of a matter document, run from chat with sources cited.",
      reads: "dismissal letter",
      writes: "summary card",
      last: "Ready in demo",
    },
    {
      key: "assistant",
      title: "Anonymise a document",
      body: "PII detection and redaction with a reviewable mapping.",
      reads: "witness statement",
      writes: "redacted copy",
      last: "Preview available",
    },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-8 rounded-card border border-rule bg-paper-sunken p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Skills in this project
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
          Run a legal skill against the matter file.
        </h2>
        <p className="mt-2 text-sm text-prose max-w-2xl leading-relaxed">
          Skills are added at workspace level, then enabled inside a
          project. This public snapshot shows the ready state: what each skill
          reads, what it produces, and where the result is recorded.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workflows.map((w) => (
          <section key={w.title} className="rounded-card border border-rule bg-paper p-5 hover:border-ink transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold tracking-tight2 text-ink">{w.title}</div>
                <p className="mt-2 text-sm text-prose leading-relaxed">{w.body}</p>
              </div>
              <span className="shrink-0 rounded-item border border-rule bg-paper-sunken px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Ready
              </span>
            </div>
            <dl className="mt-5 grid gap-2 border-t border-rule pt-4 text-xs">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 uppercase tracking-widest text-muted">Reads</dt>
                <dd className="text-ink">{w.reads}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 uppercase tracking-widest text-muted">Writes</dt>
                <dd className="text-ink">{w.writes}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 uppercase tracking-widest text-muted">Record</dt>
                <dd className="text-ink">{w.last}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onOpen(w.key)}
                className="bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-black transition-colors"
              >
                Open in chat
              </button>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 border-t border-rule pt-4 text-xs text-muted">
        Installation and setup stay behind the scenes in this public demo. The
        previews show the outputs and record trail without asking you to sign in.
      </p>
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
      <div className="mb-6 rounded-card border border-rule bg-paper-sunken p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Documents in this project
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
          The matter file is already loaded.
        </h2>
        <p className="mt-2 text-sm text-prose max-w-2xl leading-relaxed">
          These are the sources the chat and skills can use. In your own
          workspace, documents open in the reader, edits create versions, and
          source citations link back here.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-card border border-rule bg-paper">
          <div className="border-b border-rule bg-paper-sunken px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-track2 text-muted">
              Matter files
            </p>
            <label className="mt-3 block text-xs text-muted">
              <span className="sr-only">Search demo documents</span>
              <input
                value={fileQuery}
                onChange={(event) => setFileQuery(event.target.value)}
                placeholder="Search files"
                className="h-9 w-full rounded-item border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
                data-testid="demo-document-list-search"
              />
            </label>
            <p className="mt-2 text-xs text-muted" data-testid="demo-document-list-count">
              Showing {filteredDocs.length} of {docs.length} files.
            </p>
          </div>
          <div>
            {filteredDocs.map((d) => {
              const active = d.id === inspectedDoc.id;
              return (
                <div
                  key={d.id}
                  className={`border-b border-rule px-4 py-4 transition-colors ${
                    active ? "bg-wash" : "bg-paper hover:bg-wash"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onInspect(d.id)}
                    className="block w-full text-left"
                  >
                    <div className="text-sm font-semibold text-ink">{d.filename}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      {d.tag && <Badge>{d.tag.toUpperCase()}</Badge>}
                      <span>{formatBytes(d.size_bytes)}</span>
                      <span>{d.from_disclosure ? "CPR 31" : "Upload"}</span>
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-track2 text-muted">
                      Source-ready · {d.sha256.slice(0, 8)}
                    </div>
                  </button>
                  <a
                    href={`/demo/documents/${encodeURIComponent(d.id)}`}
                    className="mt-3 inline-flex text-xs text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Open reader →
                  </a>
                </div>
              );
            })}
            {filteredDocs.length === 0 && (
              <p className="px-4 py-5 text-sm text-muted">
                No demo files match this search.
              </p>
            )}
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
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/demo/documents/${encodeURIComponent(inspectedDoc.id)}`}
                className="rounded-item border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
              >
                Open full reader
              </a>
              <button
                type="button"
                onClick={() => navigate("/demo/workflows")}
                className="rounded-item border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
              >
                View skills
              </button>
            </div>
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
          <div className="border-t border-rule px-5 py-4 text-xs leading-5 text-muted">
            Original files, extracted text, edit versions, redactions, and record links live on this document surface in the working product.
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
          className="mt-4 inline-flex text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          ← Back to demo documents
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <a
          href="/demo/documents"
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          ← Back to demo documents
        </a>
        <a
          href="/demo/audit"
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          View demo Record →
        </a>
      </div>

      <header className="rounded-card border border-rule bg-paper px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Demo document
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight2 text-ink sm:text-4xl">
          {doc.filename}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-track2 text-muted">
          {doc.tag && (
            <span className="rounded-item border border-rule bg-paper-sunken px-2 py-1">
              {doc.tag}
            </span>
          )}
          <span className="rounded-item border border-rule bg-paper-sunken px-2 py-1">
            {doc.from_disclosure ? "CPR 31 disclosure" : "uploaded"}
          </span>
          <span className="rounded-item border border-rule bg-paper-sunken px-2 py-1">
            {formatBytes(doc.size_bytes)}
          </span>
          <span className="rounded-item border border-rule bg-paper-sunken px-2 py-1">
            source-ready
          </span>
        </div>
      </header>

      <main className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="order-2 min-h-[680px] rounded-card border border-rule bg-paper lg:order-1">
          <div className="border-b border-rule px-5 py-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Extracted text</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Read-only public sample. Search it like a project file.
                </p>
              </div>
              <label className="min-w-[220px] text-xs text-muted">
                <span className="sr-only">Search document</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search document"
                  className="h-9 w-full rounded-item border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
                  data-testid="demo-document-search"
                />
              </label>
            </div>
            {query.trim() && (
              <p className="mt-2 text-xs text-muted" data-testid="demo-document-search-count">
                {matchCount
                  ? `${matchCount} match${matchCount === 1 ? "" : "es"}`
                  : "No matches"}
              </p>
            )}
          </div>
          <div
            className="px-7 py-7 text-[16px] leading-8 text-ink whitespace-pre-wrap sm:px-10"
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
        </section>

        <aside className="order-1 space-y-4 lg:order-2">
          <section className="rounded-card border border-ink bg-paper p-4" data-testid="demo-document-workbench-rail">
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Document workbench
            </p>
            <h2 className="mt-1 text-sm font-semibold text-ink">This file is ready to use.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              This public demo lets you read the source, open the skills that use it,
              and inspect the record without creating an account.
            </p>
            <div className="mt-4 grid gap-2 text-sm">
              <a
                href="/demo/workflows"
                className="flex items-center justify-between rounded-item border border-ink bg-ink px-3 py-2 font-semibold text-paper hover:bg-black"
              >
                <span>Run a skill with this file</span>
                <span aria-hidden="true">→</span>
              </a>
              <a
                href="/demo/audit"
                className="flex items-center justify-between rounded-item border border-rule bg-paper-sunken px-3 py-2 font-semibold text-ink hover:border-ink"
              >
                <span>View the Record</span>
                <span aria-hidden="true">→</span>
              </a>
              <a
                href="/demo/documents"
                className="flex items-center justify-between rounded-item border border-rule bg-paper-sunken px-3 py-2 font-semibold text-ink hover:border-ink"
              >
                <span>Open other files</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </section>
          <section className="rounded-card border border-rule bg-paper p-4">
            <h2 className="text-sm font-semibold text-ink">What happens in the workspace</h2>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-muted">
              <li><span className="font-semibold text-ink">1.</span> Read or search the document.</li>
              <li><span className="font-semibold text-ink">2.</span> Open a skill that uses the file.</li>
              <li><span className="font-semibold text-ink">3.</span> Inspect the produced output.</li>
              <li><span className="font-semibold text-ink">4.</span> Open the Record to see what happened.</li>
            </ol>
          </section>
          <section className="rounded-card border border-rule bg-paper p-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                Document facts
              </summary>
            <dl className="mt-3 space-y-3 text-sm">
              <DemoReaderFact label="Type" value={doc.mime_type} />
              <DemoReaderFact
                label="Uploaded"
                value={doc.uploaded_at.replace("T", " ").slice(0, 16)}
              />
              <DemoReaderFact label="SHA-256" value={doc.sha256} mono />
            </dl>
            </details>
          </section>
        </aside>
      </main>
    </div>
  );
}

function DemoReaderFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-track2 text-muted">
        {label}
      </dt>
      <dd className={`mt-1 break-words text-ink ${mono ? "tech-token text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function demoDocumentExtract(doc: MatterDocument): string {
  if (doc.filename.includes("dismissal")) {
    return "Acme Trading Ltd confirms dismissal with effect from 12 March 2026. The reason given is alleged breach of the company social-media policy. The letter refers to a disciplinary meeting chaired by the same manager named in Ms Khan's earlier grievance.";
  }
  if (doc.filename.includes("witness")) {
    return "Ms Khan says the social-media post was made from a private account, outside working hours, to a closed audience. She had raised a grievance six weeks earlier about her line manager's conduct toward female warehouse staff.";
  }
  return "The synthetic mutual NDA contains indefinite confidentiality obligations, broad mutual indemnity language, a data-protection clause, and no governing law or jurisdiction clause.";
}
