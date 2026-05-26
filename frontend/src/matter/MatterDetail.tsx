import { useEffect, useState } from "react";
import {
  confirmGate,
  downloadGeneratedDocx,
  draftLetter,
  exportLetterDocx,
  exportPreMotionDocx,
  exportPreMotionPdf,
  getChronology,
  getLetterCatalogue,
  getMatter,
  listAudit,
  listDocuments,
  ProviderKeyMissingError,
  runPreMotionStream,
  setPrivilege,
  uploadDocument,
  UploadError,
  type AuditEntry,
  type ChronologyResponse,
  type LetterCatalogue,
  type LetterDraft,
  type Matter,
  type MatterDocument,
  type PreMotionRunResult,
} from "../lib/api";
import { navigate, useRoute } from "../lib/route";
import { useDrawer } from "../app/DrawerContext";
import { ErrorCallout, LoadingLine } from "../ui/primitives";
import { MatterNav } from "./MatterNav";
import { MatterBreadcrumb } from "./MatterBreadcrumb";
import { RightRailAssistant } from "./RightRailAssistant";
import { isTabKey, type StageProgress, type TabKey } from "./tabs/types";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { ReviewsTab } from "./tabs/ReviewsTab";
import { ResearchTab } from "./tabs/ResearchTab";
import { ChronologyTab } from "./tabs/ChronologyTab";
import { PreMotionTab } from "./tabs/PreMotionTab";
import { LettersTab } from "./tabs/LettersTab";
import { ContractReviewTab } from "./tabs/ContractReviewTab";
import { AuditTab } from "./tabs/AuditTab";
import { AssistantTab } from "./tabs/AssistantTab";
import { WorkflowsTab } from "./tabs/WorkflowsTab";

export function MatterDetail({ slug }: { slug: string }) {
  // Phase 14 A0 — drawer state is now in a context. Pre-A0 callers
  // passed onMatterLoaded / onTabChange as props from App.tsx; with
  // routed pages those callers no longer exist, so MatterDetail reads
  // the same setters from DrawerContext directly.
  const { setDrawerMatter, setDrawerTab } = useDrawer();
  const onMatterLoaded = setDrawerMatter;
  const onTabChange = setDrawerTab;
  const route = useRoute();
  const initialTab: TabKey =
    route.name === "detail" && route.tab && isTabKey(route.tab) ? route.tab : "assistant";
  const [tab, setTab] = useState<TabKey>(initialTab);

  // sync tab → drawer label
  useEffect(() => {
    onTabChange(tab);
  }, [tab, onTabChange]);

  // sync tab from hash when it changes (back/forward). Bare /matters/:slug
  // (no tab segment) lands on assistant - the workspace front door in v0.4.
  useEffect(() => {
    if (route.name === "detail" && route.tab && isTabKey(route.tab)) {
      setTab(route.tab);
    } else if (route.name === "detail" && !route.tab) {
      setTab("assistant");
    }
  }, [route]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const setTabAndHash = (next: TabKey) => {
    setTab(next);
    setMobileNavOpen(false);
    const target = `/matters/${slug}/${next}`;
    if (target !== window.location.pathname) navigate(target);
  };

  const [matter, setMatter] = useState<Matter | null>(null);
  const [docs, setDocs] = useState<MatterDocument[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [premotion, setPremotion] = useState<PreMotionRunResult | null>(null);
  const [premotionRunning, setPremotionRunning] = useState(false);
  const [premotionError, setPremotionError] = useState<string | null>(null);
  const [premotionKeyMissing, setPremotionKeyMissing] = useState<string | null>(null);
  const [premotionStages, setPremotionStages] = useState<StageProgress[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [docxBusy, setDocxBusy] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [letterDocxBusy, setLetterDocxBusy] = useState(false);
  const [letterDocxError, setLetterDocxError] = useState<string | null>(null);
  const [chron, setChron] = useState<ChronologyResponse | null>(null);
  const [showSoF, setShowSoF] = useState(false);
  const [letterCat, setLetterCat] = useState<LetterCatalogue | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [letterDraft, setLetterDraft] = useState<LetterDraft | null>(null);
  const [letterDrafting, setLetterDrafting] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterKeyMissing, setLetterKeyMissing] = useState<string | null>(null);
  const [rightRailCollapsed, setRightRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("legalise.right-rail.collapsed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("legalise.right-rail.collapsed", rightRailCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [rightRailCollapsed]);

  const load = () => {
    getMatter(slug)
      .then((m) => {
        setMatter(m);
        onMatterLoaded(m);
      })
      .catch((e) => setError(String(e)));
    listDocuments(slug).then(setDocs).catch(() => undefined);
    listAudit(slug, 30).then(setAudit).catch(() => undefined);
    getChronology(slug).then(setChron).catch(() => undefined);
    getLetterCatalogue(slug)
      .then((cat) => {
        setLetterCat(cat);
        setSelectedLetter(
          (prev) =>
            prev ?? cat.letter_types.find((lt) => lt.is_default)?.id ?? cat.letter_types[0]?.id ?? null,
        );
      })
      .catch(() => undefined);
  };

  useEffect(load, [slug]);

  // clear drawer matter on unmount
  useEffect(() => {
    return () => onMatterLoaded(null);
  }, [onMatterLoaded]);

  const onConfirmGate = async () => {
    try {
      await confirmGate(
        slug,
        "I confirm the CPR 31.22 implied undertaking - disclosed material is used only for these proceedings.",
      );
      getChronology(slug).then(setChron).catch(() => undefined);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setError(String(err));
    }
  };

  const onRunPremotion = async () => {
    setPremotionRunning(true);
    setPremotionError(null);
    setPremotionKeyMissing(null);
    setPremotion(null);
    setPremotionStages([]);
    try {
      for await (const ev of runPreMotionStream(slug, { depth: "thorough" })) {
        if (ev.event === "stage.start") {
          setPremotionStages((prev) => [
            ...prev.filter((s) => s.index !== ev.data.index),
            {
              index: ev.data.index,
              stage: ev.data.stage,
              sub_agent_count: ev.data.sub_agent_count,
              status: "running",
            },
          ]);
        } else if (ev.event === "stage.end") {
          setPremotionStages((prev) =>
            prev.map((s) =>
              s.index === ev.data.index
                ? {
                    ...s,
                    status: ev.data.errors?.length ? "error" : "done",
                    duration_ms: ev.data.duration_ms,
                    token_count: ev.data.token_count,
                    errors: ev.data.errors,
                  }
                : s,
            ),
          );
        } else if (ev.event === "result") {
          setPremotion(ev.data);
        } else if (ev.event === "error") {
          setPremotionError(ev.data.message);
        }
      }
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      if (err instanceof ProviderKeyMissingError) {
        setPremotionKeyMissing(err.provider);
      } else {
        setPremotionError(String(err));
      }
    } finally {
      setPremotionRunning(false);
    }
  };

  const onExportPdf = async () => {
    if (!premotion) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const blob = await exportPreMotionPdf(slug, premotion);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pre-motion-${slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setPdfError(String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  const onExportDocx = async () => {
    if (!premotion) return;
    setDocxBusy(true);
    setDocxError(null);
    try {
      const { file_uuid } = await exportPreMotionDocx(slug, premotion);
      const blob = await downloadGeneratedDocx(file_uuid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pre-motion-${slug}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setDocxError(String(err));
    } finally {
      setDocxBusy(false);
    }
  };

  const onDownloadLetterDocx = async () => {
    if (!letterDraft) return;
    setLetterDocxBusy(true);
    setLetterDocxError(null);
    try {
      const { file_uuid } = await exportLetterDocx(slug, {
        letter_type: letterDraft.letter_type,
        title: `${letterDraft.letter_type.toUpperCase()} - ${matter?.title || slug}`,
        draft_markdown: letterDraft.draft_markdown,
      });
      const blob = await downloadGeneratedDocx(file_uuid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${letterDraft.letter_type}-${slug}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setLetterDocxError(String(err));
    } finally {
      setLetterDocxBusy(false);
    }
  };

  const onDraftLetter = async () => {
    if (!selectedLetter) return;
    setLetterDrafting(true);
    setLetterError(null);
    setLetterKeyMissing(null);
    setLetterDraft(null);
    try {
      const draft = await draftLetter(slug, selectedLetter);
      setLetterDraft(draft);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      if (err instanceof ProviderKeyMissingError) {
        setLetterKeyMissing(err.provider);
      } else {
        setLetterError(String(err));
      }
    } finally {
      setLetterDrafting(false);
    }
  };

  const onPostureChange = async (next: string) => {
    if (!matter || matter.privilege_posture === next) return;
    try {
      const updated = await setPrivilege(slug, next);
      setMatter(updated);
      onMatterLoaded(updated);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setError(String(err));
    }
  };

  if (error && !matter) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
        <ErrorCallout message={error} />
        <a
          href="/matters"
          className="text-sm text-muted hover:text-ink transition-colors"
        >
          Back to matters
        </a>
      </div>
    );
  }

  if (!matter) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
        <LoadingLine label={`loading matter ${slug}`} />
      </div>
    );
  }

  const onUpload = async (file: File, tag?: string, fromDisclosure?: boolean) => {
    try {
      await uploadDocument(slug, file, tag, fromDisclosure);
      load();
    } catch (err) {
      // UploadError carries a friendly message for 413/415. Rethrow so
      // DocumentsTab can show it inline next to the upload control,
      // which is where the user just clicked. Other errors still
      // surface on the page-level banner.
      if (err instanceof UploadError) throw err;
      setError(String(err));
    }
  };

  return (
    <div className="flex">
      <MatterNav
        matter={matter}
        tab={tab}
        onChange={setTabAndHash}
        onPostureChange={onPostureChange}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex-1 min-w-0">
        <MatterBreadcrumb
          matter={matter}
          tab={tab}
          onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
        />
        <div className="flex">
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-10">
          {error && matter && <ErrorCallout message={error} compact />}
          {tab === "assistant" && (
            <AssistantTab
              matter={matter}
              docs={docs}
              chronology={chron?.events ?? []}
              auditCount={audit?.length ?? 0}
              setTabAndHash={setTabAndHash}
            />
          )}
          {tab === "documents" && (
            <DocumentsTab docs={docs} onUpload={onUpload} />
          )}
          {tab === "chronology" && (
            <ChronologyTab
              chron={chron}
              showSoF={showSoF}
              setShowSoF={setShowSoF}
              onConfirmGate={onConfirmGate}
            />
          )}
          {tab === "workflows" && <WorkflowsTab slug={slug} />}
          {tab === "audit" && <AuditTab audit={audit} matter={matter} />}
          {/* Workflow surfaces - reached via Workflows page; sidebar highlights Workflows. */}
          {tab === "premotion" && (
            <PreMotionTab
              matter={matter}
              running={premotionRunning}
              error={premotionError}
              keyMissingProvider={premotionKeyMissing}
              stages={premotionStages}
              result={premotion}
              onRun={onRunPremotion}
              pdfBusy={pdfBusy}
              pdfError={pdfError}
              onExportPdf={onExportPdf}
              docxBusy={docxBusy}
              docxError={docxError}
              onExportDocx={onExportDocx}
            />
          )}
          {tab === "letters" && (
            <LettersTab
              matter={matter}
              catalogue={letterCat}
              selected={selectedLetter}
              onSelect={setSelectedLetter}
              drafting={letterDrafting}
              error={letterError}
              keyMissingProvider={letterKeyMissing}
              draft={letterDraft}
              onDraft={onDraftLetter}
              docxBusy={letterDocxBusy}
              docxError={letterDocxError}
              onDownloadDocx={onDownloadLetterDocx}
            />
          )}
          {tab === "contract-review" && matter && docs && (
            <ContractReviewTab matter={matter} docs={docs} />
          )}
          {tab === "reviews" && matter && <ReviewsTab matter={matter} />}
          {tab === "research" && matter && <ResearchTab matter={matter} />}
        </main>
        {tab !== "assistant" && tab !== "workflows" && tab !== "audit" && (
          <RightRailAssistant
            matter={matter}
            collapsed={rightRailCollapsed}
            onToggleCollapsed={() => setRightRailCollapsed((v) => !v)}
            onOpenFull={() => setTabAndHash("assistant")}
          />
        )}
        </div>
      </div>
    </div>
  );
}

// v0.4: compact left rail (MatterNav) + slim breadcrumb (MatterBreadcrumb)
// replace the v0.3.1 MatterHeader + MatterTabBar. Five sidebar primitives;
// installed modules nest behind Workflows. Bare /matters/:slug lands on
// the Assistant tab. See docs/DESIGN.md "What changed in v0.4".
