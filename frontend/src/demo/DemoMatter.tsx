// Read-only demo workspace for `#/demo`. Mirrors MatterDetail's shell
// (MatterHeader + MatterTabBar + main column) but feeds every tab from
// the hard-coded snapshot. Mutation handlers flash a workspace-framed
// sign-up CTA. Zero backend calls.

import { useEffect, useState } from "react";
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

// Open evaluation: one consistent prompt across all disabled demo
// actions, not six different waitlist nags. Signup is open, so the
// action is "create an account", not "join a waitlist".
const CTA_CREATE_ACCOUNT = "Create a free account to run this on your own matter";
const CTA_RUN_PREMOTION = CTA_CREATE_ACCOUNT;
const CTA_DRAFT_LETTER = CTA_CREATE_ACCOUNT;
const CTA_EXPORT = CTA_CREATE_ACCOUNT;
const CTA_CONTRACT_REVIEW = CTA_CREATE_ACCOUNT;

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
      : "assistant";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [flash, setFlash] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (route.name === "demo" && route.tab && isTabKey(route.tab)) {
      setTab(route.tab as TabKey);
    } else if (route.name === "demo" && !route.tab) {
      setTab("assistant");
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
  const flashPosture = () => flashCta(CTA_CREATE_ACCOUNT);

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
                disabledPlaceholder="Create a free account to chat with the assistant on your own matter"
                onDisabledAction={() => flashCta(CTA_CREATE_ACCOUNT)}
              />
            )}
            {tab === "documents" && (
              <DemoDocumentsTab
                docs={documents}
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
              <DemoWorkflowsTab onOpen={setTabAndHash} onRun={() => flashCta(CTA_CREATE_ACCOUNT)} />
            )}
            {tab === "audit" && <AuditTab audit={DEMO_SNAPSHOT.audit} matter={matter} />}
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

function FlashCta({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="border-b border-rule bg-paper px-4 sm:px-6 lg:px-10 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-mono uppercase tracking-track2 text-[10px] font-bold text-ink">
        Sandbox
      </span>
      <span className="text-sm text-ink">{message}.</span>
      <a
        href="/auth/signup"
        className="bg-ink text-paper px-3 py-1.5 hover:bg-black transition-colors text-xs font-medium min-h-[32px] inline-flex items-center"
      >
        Create account
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

function DemoWorkflowsTab({
  onOpen,
  onRun,
}: {
  onOpen: (tab: TabKey) => void;
  onRun: () => void;
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
          Governed skills
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
          Pick the work you want the AI to prepare.
        </h2>
        <p className="mt-2 text-sm text-prose max-w-2xl leading-relaxed">
          Each action declares the material it reads, the output it writes, and
          the record it leaves behind. The demo previews the loop; your own
          workspace can run it.
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
                className="border border-rule px-3 py-2 text-sm text-ink hover:border-ink hover:bg-wash transition-colors"
              >
                Open preview
              </button>
              <button
                type="button"
                onClick={onRun}
                className="bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-black transition-colors"
              >
                Run on my matter
              </button>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 border-t border-rule pt-4 text-xs text-muted">
        Module installation and permission setup are hidden in this public
        snapshot. They appear when you work inside your own matter.
      </p>
    </div>
  );
}

// -- Documents (demo variant) ----------------------------------------------
// Mirrors DocumentsTab's layout but expansion shows a sign-up CTA panel
// instead of the live EditPanel / AnonymiseButton (both of which fetch).

function DemoDocumentsTab({
  docs,
}: {
  docs: MatterDocument[];
}) {
  return (
    <div className="max-w-5xl">
      <div className="mb-8 border border-rule bg-paper-sunken p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Matter file
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
          The demo matter is already loaded.
        </h2>
        <p className="mt-2 text-sm text-prose max-w-2xl leading-relaxed">
          These are the documents the assistant and actions can cite. In your
          own workspace, uploaded material is hashed, stored, and recorded.
        </p>
      </div>

      <div className="overflow-hidden border border-rule bg-paper">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[1.5fr_110px_90px_120px_100px] gap-4 px-5 py-3 text-muted bg-paper-sunken border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
            <span>Document</span>
            <span>Type</span>
            <span>Size</span>
            <span>Source</span>
            <span className="text-right">Action</span>
          </div>
          {docs.map((d) => (
            <div key={d.id} className="border-b border-rule">
              <div className="grid grid-cols-[1.5fr_110px_90px_120px_100px] gap-4 px-5 py-4 items-center hover:bg-wash transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{d.filename}</div>
                  <div className="mt-0.5 text-[11px] text-muted truncate">{d.sha256.slice(0, 8)}</div>
                </div>
                <span>{d.tag && <Badge>{d.tag.toUpperCase()}</Badge>}</span>
                <span className="text-xs text-ink">{formatBytes(d.size_bytes)}</span>
                <span>{d.from_disclosure ? <Badge>CPR 31</Badge> : <span className="text-xs text-muted">Upload</span>}</span>
                <span className="text-muted uppercase tracking-track2 text-[9px] text-right">
                  Ready
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Public demo shares the MatterNav + MatterBreadcrumb shell with the
// live workspace. Mutation handlers flash a sign-up CTA.
