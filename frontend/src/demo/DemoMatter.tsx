// Read-only demo workspace for `/demo`. Mirrors the matter shell but
// feeds every surface from the hard-coded snapshot. Zero backend calls.

import { useEffect, useMemo, useState } from "react";
import type { MatterDocument } from "../lib/api";
import { isPublicRoute, navigate, useRoute } from "../lib/route";
import { Badge } from "../ui/primitives";
import { MatterNav } from "../matter/MatterNav";
import { MatterBreadcrumb } from "../matter/MatterBreadcrumb";
import { isTabKey, type TabKey } from "../matter/tabs/types";
import { ChronologyTab } from "../matter/tabs/ChronologyTab";
import { PreMotionTab } from "../matter/tabs/PreMotionTab";
import { LettersTab } from "../matter/tabs/LettersTab";
import { AuditTab } from "../matter/tabs/AuditTab";
import { AssistantTab } from "../matter/tabs/AssistantTab";
import { ReviewsTab } from "../modules/tabular_review/ReviewsTab";
import { ResearchTab } from "../modules/case_law/ResearchTab";
import { ContractReviewTab } from "../modules/contract_review/ContractReviewTab";
import { DEMO_SNAPSHOT } from "./snapshot";

const DEMO_NAV: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "assistant", label: "Chat" },
  { key: "documents", label: "Documents" },
  { key: "workflows", label: "Skills" },
  { key: "audit", label: "Record" },
];

const DEMO_READ_ONLY =
  "This public demo is read-only. Use the previews to inspect the project loop.";

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

  // Letters: rotate the local selection but always render the pre-baked draft
  // for the default ("lba") letter. Picking another letter type just flashes
  // the sign-up CTA on Draft.
  const [selectedLetter, setSelectedLetter] = useState<string | null>(
    DEMO_SNAPSHOT.letterCatalogue.letter_types.find((lt) => lt.is_default)?.id ??
      DEMO_SNAPSHOT.letterCatalogue.letter_types[0]?.id ??
      null,
  );

  const [showSoF, setShowSoF] = useState(false);
  const flashPosture = () => flashCta(DEMO_READ_ONLY);

  return (
    <>
      <div>
        {flash && <FlashCta message={flash} onClose={() => setFlash(null)} />}
      </div>
      <div className="flex">
        <MatterNav
          matter={matter}
          tab={tab}
          onChange={setTabAndHash}
          onPostureChange={flashPosture}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
          showPosture={false}
          navItems={DEMO_NAV}
        />
        <div className="flex-1 min-w-0">
          <MatterBreadcrumb
            matter={matter}
            tab={tab}
            onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
          />
          <div className="flex bg-wash">
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-8 lg:py-12 min-h-[calc(100vh-80px)]">
            {tab === "assistant" && (
              <div className="space-y-8">
                <DemoStartPanel
                  docs={documents}
                  auditCount={DEMO_SNAPSHOT.audit.length}
                  onOpen={setTabAndHash}
                  onRun={() => setTabAndHash("contract-review")}
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
            {tab === "premotion" && (
              <PreMotionTab
                matter={matter}
                running={false}
                error={null}
                stages={[]}
                result={DEMO_SNAPSHOT.preMotion}
                onRun={() => flashCta(DEMO_READ_ONLY)}
                pdfBusy={false}
                pdfError={null}
                onExportPdf={() => flashCta(DEMO_READ_ONLY)}
                docxBusy={false}
                docxError={null}
                onExportDocx={() => flashCta(DEMO_READ_ONLY)}
              />
            )}
            {tab === "letters" && (
              <LettersTab
                matter={matter}
                catalogue={DEMO_SNAPSHOT.letterCatalogue}
                selected={selectedLetter}
                onSelect={setSelectedLetter}
                drafting={false}
                error={null}
                draft={
                  selectedLetter === DEMO_SNAPSHOT.letterDraft.letter_type
                    ? DEMO_SNAPSHOT.letterDraft
                    : null
                }
                onDraft={() => flashCta(DEMO_READ_ONLY)}
                docxBusy={false}
                docxError={null}
                onDownloadDocx={() => flashCta(DEMO_READ_ONLY)}
              />
            )}
            {tab === "contract-review" && (
              <ContractReviewTab
                matter={matter}
                docs={documents}
                previewResult={DEMO_SNAPSHOT.contractReview}
                onRunOverride={() => flashCta(DEMO_READ_ONLY)}
              />
            )}
            {tab === "reviews" && (
              <ReviewsTab matter={matter} initialReviews={DEMO_SNAPSHOT.reviews} />
            )}
            {tab === "research" && (
              <ResearchTab matter={matter} initialCitations={DEMO_SNAPSHOT.citations} />
            )}
          </main>
          </div>
        </div>
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
    <section className="mx-auto w-full max-w-[1220px] border border-rule bg-paper p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Public demo
          </p>
          <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight2 text-ink sm:text-3xl">
            A legal project with documents, skills, and a record of what the AI did.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-prose">
            This read-only Khan v Acme matter shows the current Legalise loop:
            open a project, inspect the documents, run a skill, review the
            output, then trace it in the matter Record.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onOpen("documents")}
              className="border border-rule bg-paper px-3 py-2 text-sm font-medium text-ink hover:border-ink"
            >
              View documents
            </button>
            <button
              type="button"
              onClick={() => onOpen("workflows")}
              className="border border-rule bg-paper px-3 py-2 text-sm font-medium text-ink hover:border-ink"
            >
              View skills
            </button>
            <button
              type="button"
              onClick={onRun}
              className="bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-black"
            >
              Open skill preview
            </button>
          </div>
        </div>
        <div className="grid gap-3 text-sm">
          <DemoFact label="Documents" value={`${docs.length} loaded`} body="Matter evidence and drafts are in one folder." />
          <DemoFact label="Skills" value="4 ready" body="Skills say what they read and what they produce." />
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
    <div className="border border-rule bg-paper-sunken p-3">
      <div className="font-mono text-[10px] uppercase tracking-track2 text-muted">
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
      <span className="font-mono uppercase tracking-track2 text-[10px] font-bold text-ink">
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
      key: "contract-review",
      title: "Review the NDA",
      body: "Flags enforceability, data-protection and missing governing-law issues.",
      reads: "synthetic-mutual-nda.docx",
      writes: "findings pack",
      last: "Ready in demo",
    },
    {
      key: "premotion",
      title: "Pre-motion analysis",
      body: "Tests the conduct dismissal framing against the documents and chronology.",
      reads: "dismissal letter, witness statement",
      writes: "motion draft",
      last: "Preview available",
    },
    {
      key: "letters",
      title: "Draft a letter before action",
      body: "Produces a first draft from the dismissal facts and limitation dates.",
      reads: "matter record",
      writes: "letter draft",
      last: "Preview available",
    },
    {
      key: "research",
      title: "Check authorities",
      body: "Surfaces relevant authorities for the point being worked on.",
      reads: "issue framing",
      writes: "case-law note",
      last: "Preview available",
    },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-8 border border-rule bg-paper-sunken p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Skills in this project
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
          Run a legal skill against the matter file.
        </h2>
        <p className="mt-2 text-sm text-prose max-w-2xl leading-relaxed">
          Skills are installed at workspace level, then enabled inside a
          project. This public snapshot shows the ready state: what each skill
          reads, what it produces, and where the result is recorded.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workflows.map((w) => (
          <section key={w.key} className="border border-rule bg-paper p-5 hover:border-ink transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold tracking-tight2 text-ink">{w.title}</div>
                <p className="mt-2 text-sm text-prose leading-relaxed">{w.body}</p>
              </div>
              <span className="shrink-0 border border-rule bg-paper-sunken px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
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
                Open preview
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
      <div className="max-w-5xl border border-rule bg-paper p-5 text-sm text-muted">
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
      <div className="mb-6 border border-rule bg-paper-sunken p-5">
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
        <div className="border border-rule bg-paper">
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
                className="h-9 w-full border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
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

        <section className="min-h-[620px] border border-rule bg-paper">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Document reader
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
                {inspectedDoc.filename}
              </h3>
              <p className="mt-1 text-xs text-muted">
                Extracted text preview. In the live workspace, source chips open this reader.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/demo/documents/${encodeURIComponent(inspectedDoc.id)}`}
                className="border border-ink bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-black"
              >
                Open full reader
              </a>
              <button
                type="button"
                onClick={() => navigate("/demo/workflows")}
                className="border border-rule px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
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
                  className="h-9 w-full border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
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
      <div className="max-w-4xl border border-rule bg-paper p-6">
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

      <header className="border border-rule bg-paper px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Demo document
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight2 text-ink sm:text-4xl">
          {doc.filename}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-track2 text-muted">
          {doc.tag && (
            <span className="border border-rule bg-paper-sunken px-2 py-1">
              {doc.tag}
            </span>
          )}
          <span className="border border-rule bg-paper-sunken px-2 py-1">
            {doc.from_disclosure ? "CPR 31 disclosure" : "uploaded"}
          </span>
          <span className="border border-rule bg-paper-sunken px-2 py-1">
            {formatBytes(doc.size_bytes)}
          </span>
          <span className="border border-rule bg-paper-sunken px-2 py-1">
            source-ready
          </span>
        </div>
      </header>

      <main className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="order-2 min-h-[680px] border border-rule bg-paper lg:order-1">
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
                  className="h-9 w-full border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
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
          <section className="border border-ink bg-paper p-4" data-testid="demo-document-workbench-rail">
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Document workbench
            </p>
            <h2 className="mt-1 text-sm font-semibold text-ink">This file is ready to use.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              In the product, chat and skills use this reader as their source surface.
              Source chips come back here so a solicitor can check the text before
              relying on output.
            </p>
            <div className="mt-4 grid gap-2 text-sm">
              <a
                href="/demo/workflows"
                className="flex items-center justify-between border border-ink bg-ink px-3 py-2 font-semibold text-paper hover:bg-black"
              >
                <span>Run a skill with this file</span>
                <span aria-hidden="true">→</span>
              </a>
              <a
                href="/demo/audit"
                className="flex items-center justify-between border border-rule bg-paper-sunken px-3 py-2 font-semibold text-ink hover:border-ink"
              >
                <span>View the Record</span>
                <span aria-hidden="true">→</span>
              </a>
              <a
                href="/demo/documents"
                className="flex items-center justify-between border border-rule bg-paper-sunken px-3 py-2 font-semibold text-ink hover:border-ink"
              >
                <span>Open other files</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </section>
          <section className="border border-rule bg-paper p-4">
            <h2 className="text-sm font-semibold text-ink">What happens in the workspace</h2>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-muted">
              <li><span className="font-semibold text-ink">1.</span> Read or search the document.</li>
              <li><span className="font-semibold text-ink">2.</span> Run a skill with the file selected.</li>
              <li><span className="font-semibold text-ink">3.</span> Review and sign the output.</li>
              <li><span className="font-semibold text-ink">4.</span> Export the working pack record.</li>
            </ol>
          </section>
          <section className="border border-rule bg-paper p-4">
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
      <dd className={`mt-1 break-words text-ink ${mono ? "font-mono text-xs" : ""}`}>
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

// Public demo shares the MatterNav + MatterBreadcrumb shell with the
// live workspace. Mutation handlers flash a sign-up CTA.
