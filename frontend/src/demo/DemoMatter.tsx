// Read-only demo workspace for `#/demo`. Mirrors MatterDetail's layout
// (PanelHeader + TabBar + tab content) but feeds every tab from the
// hard-coded snapshot. Mutation handlers flash a workspace-framed sign-up
// CTA. Zero backend calls.

import { useEffect, useState, type ChangeEvent } from "react";
import type { MatterDocument } from "../lib/api";
import { isPublicRoute, navigate, useRoute } from "../lib/route";
import { Badge, StatusBadge } from "../ui/primitives";
import { PrivilegeControl } from "../matter/PrivilegeControl";
import { isTabKey, TABS, type TabKey } from "../matter/tabs/types";
import { OverviewTab } from "../matter/tabs/OverviewTab";
import { ChronologyTab } from "../matter/tabs/ChronologyTab";
import { PreMotionTab } from "../matter/tabs/PreMotionTab";
import { LettersTab } from "../matter/tabs/LettersTab";
import { AuditTab } from "../matter/tabs/AuditTab";
import { AssistantTab } from "../matter/tabs/AssistantTab";
import { ReviewsTab } from "../modules/tabular_review/ReviewsTab";
import { ResearchTab } from "../modules/case_law/ResearchTab";
import { ContractReviewTab } from "../modules/contract_review/ContractReviewTab";
import { DEMO_SNAPSHOT } from "./snapshot";

const CTA_RUN_PREMOTION = "Sign up to run Pre-Motion on your own matter";
const CTA_DRAFT_LETTER = "Sign up to draft letters on your own matter";
const CTA_UPLOAD_DOC = "Sign up to upload documents to your own matter";
const CTA_EDIT_DOC = "Sign up to edit or anonymise documents on your own matter";
const CTA_EXPORT = "Sign up to export documents from your own matter";
const CTA_CONTRACT_REVIEW = "Sign up to run Contract Review on your own matter";

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

export function DemoMatter() {
  const route = useRoute();
  const initialTab: TabKey =
    route.name === "demo" && route.tab && isTabKey(route.tab)
      ? (route.tab as TabKey)
      : "overview";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (route.name === "demo" && route.tab && isTabKey(route.tab)) {
      setTab(route.tab as TabKey);
    } else if (route.name === "demo" && !route.tab) {
      setTab("overview");
    }
  }, [route]);

  // Demo route is public - make sure no protected-route redirect interferes.
  useEffect(() => {
    if (route.name === "demo" && !isPublicRoute(route)) {
      // Defensive - should never hit; the route allowlist already covers it.
    }
  }, [route]);

  const setTabAndHash = (next: TabKey) => {
    setTab(next);
    const target = next === "overview" ? "/demo" : `/demo/${next}`;
    if (`#${target}` !== window.location.hash) navigate(target);
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

  return (
    <div className="max-w-page mx-auto">
      <DemoBanner />
      {flash && <FlashCta message={flash} onClose={() => setFlash(null)} />}

      <PanelHeader matter={matter} onPostureChange={noop} />
      <TabBar tab={tab} onChange={setTabAndHash} />

      <div className="px-4 sm:px-6 lg:px-10 py-8">
        {tab === "overview" && <OverviewTab matter={matter} />}
        {tab === "documents" && (
          <DemoDocumentsTab
            docs={documents}
            onUpload={() => flashCta(CTA_UPLOAD_DOC)}
            onEdit={() => flashCta(CTA_EDIT_DOC)}
          />
        )}
        {tab === "reviews" && (
          <ReviewsTab matter={matter} initialReviews={DEMO_SNAPSHOT.reviews} />
        )}
        {tab === "research" && (
          <ResearchTab matter={matter} initialCitations={DEMO_SNAPSHOT.citations} />
        )}
        {tab === "chronology" && (
          <ChronologyTab
            chron={DEMO_SNAPSHOT.chronology}
            showSoF={showSoF}
            setShowSoF={setShowSoF}
            onConfirmGate={noop}
          />
        )}
        {tab === "premotion" && (
          <PreMotionTab
            matter={matter}
            running={false}
            error={null}
            stages={[]}
            result={DEMO_SNAPSHOT.preMotion}
            onRun={() => flashCta(CTA_RUN_PREMOTION)}
            pdfBusy={false}
            pdfError={null}
            onExportPdf={() => flashCta(CTA_EXPORT)}
            docxBusy={false}
            docxError={null}
            onExportDocx={() => flashCta(CTA_EXPORT)}
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
            onDraft={() => flashCta(CTA_DRAFT_LETTER)}
            docxBusy={false}
            docxError={null}
            onDownloadDocx={() => flashCta(CTA_EXPORT)}
          />
        )}
        {tab === "contract-review" && (
          <ContractReviewTab
            matter={matter}
            docs={documents}
            previewResult={DEMO_SNAPSHOT.contractReview}
            onRunOverride={() => flashCta(CTA_CONTRACT_REVIEW)}
          />
        )}
        {tab === "audit" && <AuditTab audit={DEMO_SNAPSHOT.audit} />}
        {tab === "assistant" && (
          <AssistantTab
            matter={matter}
            docs={documents}
            chronology={DEMO_SNAPSHOT.chronology.events}
            setTabAndHash={setTabAndHash}
            initialMessages={DEMO_SNAPSHOT.assistantMessages}
            disabled
            disabledPlaceholder="Sign up to chat with the assistant on your own matter"
          />
        )}
      </div>
    </div>
  );
}

// -- Banner -----------------------------------------------------------------

function DemoBanner() {
  return (
    <div className="border-b border-rule bg-wash px-4 sm:px-6 lg:px-10 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 bg-ink" aria-hidden />
        <span className="font-mono uppercase tracking-track2 text-[10px] font-bold text-ink">
          Read-only demo
        </span>
      </div>
      <p className="text-sm text-prose">
        Khan v Acme - a worked unfair-dismissal matter. Browse every tab. Mutations are disabled. Sign up to upload your own matter.
      </p>
      <a
        href="#/auth/signup"
        className="ml-auto bg-ink text-paper px-3 py-1.5 hover:bg-black transition-colors text-sm font-medium min-h-[36px] inline-flex items-center"
      >
        Sign up →
      </a>
    </div>
  );
}

function FlashCta({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="border-b border-rule bg-paper px-4 sm:px-6 lg:px-10 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-mono uppercase tracking-track2 text-[10px] font-bold text-ink">
        Sandbox
      </span>
      <span className="text-sm text-ink">{message}.</span>
      <a
        href="#/auth/signup"
        className="bg-ink text-paper px-3 py-1.5 hover:bg-black transition-colors text-xs font-medium min-h-[32px] inline-flex items-center"
      >
        Sign up
      </a>
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

// -- Documents (demo variant) ----------------------------------------------
// Mirrors DocumentsTab's layout but expansion shows a sign-up CTA panel
// instead of the live EditPanel / AnonymiseButton (both of which fetch).

function DemoDocumentsTab({
  docs,
  onUpload,
  onEdit,
}: {
  docs: MatterDocument[];
  onUpload: () => void;
  onEdit: () => void;
}) {
  const [tag, setTag] = useState("");
  const [fromDisclosure, setFromDisclosure] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    onUpload();
    e.target.value = "";
  };

  const inputCls =
    "bg-paper border border-rule px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-none transition-colors min-h-[44px] font-sans text-ink";

  return (
    <div>
      <form className="mb-10 flex flex-wrap items-end gap-4" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Tag</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={inputCls}
            placeholder="pleadings"
          />
          <span className="text-xs text-muted">optional - e.g. pleadings, disclosure</span>
        </label>
        <label className="flex items-center gap-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={fromDisclosure}
            onChange={(e) => setFromDisclosure(e.target.checked)}
          />
          <span className="text-sm text-ink">From disclosure (CPR 31)</span>
        </label>
        <label className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center cursor-pointer">
          Upload document
          <input type="file" className="hidden" onChange={onFile} />
        </label>
      </form>

      <div className="border-t border-rule overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[110px_1fr_90px_120px_120px_72px] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
            <span>SHA</span>
            <span>Filename</span>
            <span>Size</span>
            <span>Tag</span>
            <span>Disclosure</span>
            <span className="text-right">Action</span>
          </div>
          {docs.map((d) => (
            <div key={d.id} className="border-b border-rule">
              <div
                className="grid grid-cols-[110px_1fr_90px_120px_120px_72px] gap-4 px-4 py-3 hover:bg-wash transition-colors font-mono text-[11px] items-center cursor-pointer"
                onClick={() => setEditingId(editingId === d.id ? null : d.id)}
              >
                <span className="text-muted truncate">{d.sha256.slice(0, 8)}</span>
                <span className="text-ink truncate">{d.filename}</span>
                <span className="text-ink">{formatBytes(d.size_bytes)}</span>
                <span>{d.tag && <Badge>{d.tag.toUpperCase()}</Badge>}</span>
                <span>{d.from_disclosure && <Badge>CPR 31</Badge>}</span>
                <span className="text-muted uppercase tracking-track2 text-[9px] text-right">
                  {editingId === d.id ? "Close" : "Edit"}
                </span>
              </div>
              {editingId === d.id && (
                <div className="border-t border-rule bg-paper p-5">
                  <div className="font-mono uppercase tracking-track2 text-[10px] text-muted mb-2">
                    Document edit · {d.filename}
                  </div>
                  <p className="text-sm text-ink mb-3">
                    Inside a live matter, this panel runs an instructed edit pass (tighten, rewrite,
                    summarise, jurisdiction sweep) and surfaces tracked changes for accept / reject.
                    The Anonymise control sits beside it and emits a [PARTY_n] / [ORG_n] redacted
                    body. Both are disabled in the read-only demo.
                  </p>
                  <button
                    onClick={onEdit}
                    className="bg-ink text-paper px-3 py-1.5 hover:bg-black transition-colors text-xs font-medium min-h-[32px]"
                  >
                    Sign up to edit or anonymise
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -- PanelHeader + TabBar (mirror MatterDetail) -----------------------------

function PanelHeader({
  matter,
  onPostureChange,
}: {
  matter: import("../lib/api").Matter;
  onPostureChange: (next: string) => void;
}) {
  return (
    <div className="border-b border-rule px-4 sm:px-6 lg:px-10 py-4 flex flex-wrap items-center gap-x-8 gap-y-4 bg-paper">
      <div className="flex flex-col">
        <span className="text-xl font-mono font-bold tracking-tight text-ink">
          {matter.slug}
        </span>
        <span className="text-sm text-prose">{matter.title}</span>
      </div>
      <div className="flex flex-col justify-center">
        <span className="eyebrow tracking-track2 mb-0.5">Matter type</span>
        <span className="text-ink font-mono text-xs font-bold">{matter.matter_type}</span>
      </div>
      <div className="flex flex-col justify-center">
        <span className="eyebrow tracking-track2 mb-0.5">Status</span>
        <span className="text-xs font-bold">
          <StatusBadge status={matter.status} />
        </span>
      </div>
      <div className="flex flex-col justify-center">
        <span className="eyebrow tracking-track2 mb-0.5">Model</span>
        <span className="text-ink font-mono text-xs font-bold">{matter.default_model_id}</span>
      </div>
      <div className="flex flex-col justify-center">
        <span className="eyebrow tracking-track2 mb-0.5">Posture</span>
        <PrivilegeControl value={matter.privilege_posture} onChange={onPostureChange} />
      </div>
    </div>
  );
}

function TabBar({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="border-b border-rule px-4 sm:px-6 lg:px-10 flex gap-8 overflow-x-auto bg-paper">
      {TABS.map((t) => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={
              "min-h-[44px] -mb-px border-b-2 px-1 text-sm font-medium transition-colors whitespace-nowrap " +
              (active
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
