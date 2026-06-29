import { useEffect, useState } from "react";
import {
  confirmGate,
  getBootstrapState,
  getChronology,
  getMatter,
  listAudit,
  listDocuments,
  setPrivilege,
  uploadDocument,
  UploadError,
  type AuditEntry,
  type ChronologyResponse,
  type Matter,
  type MatterDocument,
} from "../lib/api";
import { navigate, useRoute } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { useDrawer } from "../app/DrawerContext";
import { ErrorCallout, LoadingLine } from "../ui/primitives";
import { GrantsPanel } from "./GrantsPanel";
import { MatterSkillsTab } from "./MatterSkillsTab";
import { PostureBanner } from "./PostureBanner";
import { isTabKey, type TabKey } from "./tabs/types";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { ChronologyTab } from "./tabs/ChronologyTab";
import { AuditTab } from "./tabs/AuditTab";
import { ApprovalsTab } from "./tabs/ApprovalsTab";
import { AssistantTab } from "./tabs/AssistantTab";

export function MatterDetail({ slug }: { slug: string }) {
  // drawer state is now in a context. Pre-A0 callers
  // passed onMatterLoaded / onTabChange as props from App.tsx; with
  // routed pages those callers no longer exist, so MatterDetail reads
  // the same setters from DrawerContext directly.
  const { setDrawerMatter, setDrawerTab } = useDrawer();
  const onMatterLoaded = setDrawerMatter;
  const onTabChange = setDrawerTab;
  // posture banner reads the current user role.
  const auth = useAuth();
  const route = useRoute();
  // Bare /matters/:slug lands on Overview — when you open a matter you
  // expect a summary of it first. Documents, chat and the rest are one
  // click away. Deep links to a specific tab (/matters/:slug/:tab) still win.
  const initialTab: TabKey =
    route.name === "detail" && route.tab && isTabKey(route.tab) ? route.tab : "overview";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const initialChatDocumentId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("document")
      : null;

  // sync tab → drawer label
  useEffect(() => {
    onTabChange(tab);
  }, [tab, onTabChange]);

  // Sync tab from path changes (back/forward). Bare /matters/:slug
  // lands on Documents.
  useEffect(() => {
    if (route.name === "detail" && route.tab && isTabKey(route.tab)) {
      setTab(route.tab);
    } else if (route.name === "detail" && !route.tab) {
      setTab("overview");
    }
  }, [route]);

  const setTabAndHash = (next: TabKey) => {
    setTab(next);
    const target = `/matters/${slug}/${next}`;
    if (target !== window.location.pathname) navigate(target);
  };

  const [matter, setMatter] = useState<Matter | null>(null);
  const [docs, setDocs] = useState<MatterDocument[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  // whether the firm role hierarchy is enforced. Drives
  // the posture banner: dormant (default) means no B_mixed
  // qualified-solicitor blocker. Defaults true (enforced) until the
  // system state resolves, so we never silently hide a live gate.
  const [firmRoleGates, setFirmRoleGates] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [chron, setChron] = useState<ChronologyResponse | null>(null);
  const [showSoF, setShowSoF] = useState(false);
  const load = () => {
    getMatter(slug)
      .then((m) => {
        setMatter(m);
        onMatterLoaded(m);
      })
      .catch((e) => setError(String(e)));
    listDocuments(slug).then(setDocs).catch(() => undefined);
    listAudit(slug, 30).then(setAudit).catch(() => undefined);
    getBootstrapState()
      .then((s) => setFirmRoleGates(s.firm_role_gates_enabled ?? true))
      .catch(() => undefined);
    getChronology(slug).then(setChron).catch(() => undefined);
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
        <p className="mb-6">
          <a
            href="/matters"
            className="text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            ← Matters
          </a>
        </p>
        <ErrorCallout message={error} />
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
    <div className="flex-1 min-w-0">
        <div className="flex">
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-12 py-12">
          {error && matter && <ErrorCallout message={error} compact />}
          {matter && (
            <div className="mb-4 flex justify-end">
              <MatterActionsMenu slug={slug} />
            </div>
          )}
          {matter && (
            <PostureBanner
              posture={matter.privilege_posture}
              user={auth.user}
              firmRoleGatesEnabled={firmRoleGates}
              onChangePosture={onPostureChange}
            />
          )}
          {tab === "overview" && (
            <OverviewTab
              matter={matter}
              onMatterUpdated={(m) => {
                setMatter(m);
                onMatterLoaded(m);
              }}
            />
          )}
          {tab === "assistant" && (
            <AssistantTab
              matter={matter}
              docs={docs}
              chronology={chron?.events ?? []}
              auditCount={audit?.length ?? 0}
              setTabAndHash={setTabAndHash}
              initialDocumentId={initialChatDocumentId}
              onPostureChange={onPostureChange}
            />
          )}
          {tab === "documents" && (
            <DocumentsTab slug={slug} docs={docs} onUpload={onUpload} onReload={load} />
          )}
          {tab === "chronology" && (
            <ChronologyTab
              chron={chron}
              slug={slug}
              showSoF={showSoF}
              setShowSoF={setShowSoF}
              onConfirmGate={onConfirmGate}
              onReload={load}
            />
          )}
          {tab === "workflows" && <MatterSkillsTab slug={matter.slug} />}
          {tab === "permissions" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold text-ink">Permissions</h1>
                <p className="mt-2 text-sm text-muted max-w-prose">
                  Direct capability-grant management for this matter — for
                  operators who need to inspect or edit which skills and
                  models are permitted. Day-to-day, skills are run from the
                  Skills tab.
                </p>
              </div>
              <div className="space-y-8">
                <GrantsPanel
                  slug={matter.slug}
                  defaultModelId={matter.default_model_id}
                  requiredProvider={matter.required_provider}
                />
              </div>
            </div>
          )}
          {tab === "audit" && <AuditTab audit={audit} matter={matter} />}
          {tab === "approvals" && <ApprovalsTab slug={matter.slug} />}
        </main>
        </div>
    </div>
  );
}

// Matter actions menu — the real home for the lifecycle surface
// (Export / Close / Delete) plus the operator Permissions entry, which
// used to be an 11px underlined link and a buried <details>. Routine
// actions are grouped; the destructive Delete is visually separated
// (divider + seal colour). Export / Close / Delete all land on the
// existing /lifecycle page (route unchanged); Permissions opens the
// in-shell permissions surface.
function MatterActionsMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-matter-actions]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const lifecycle = `/matters/${slug}/lifecycle`;
  const itemCls = "block px-3 py-2 text-sm text-ink hover:bg-panel-hover";

  return (
    <div className="relative" data-matter-actions>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-item border border-rule px-3 py-1.5 text-sm text-ink hover:bg-panel-hover transition-colors"
      >
        Manage matter
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 bg-paper border border-rule rounded-item shadow-panel overflow-hidden z-20"
        >
          <a href={lifecycle} role="menuitem" className={itemCls}>
            Export
          </a>
          <a href={lifecycle} role="menuitem" className={itemCls}>
            Close &amp; archive
          </a>
          <a href={`/matters/${slug}/permissions`} role="menuitem" className={itemCls}>
            Permissions
          </a>
          <div className="border-t border-rule" />
          <a
            href={lifecycle}
            role="menuitem"
            className="block px-3 py-2 text-sm text-seal hover:bg-panel-hover"
          >
            Delete matter
          </a>
        </div>
      )}
    </div>
  );
}

// MatterDetail should stay a shell + tab switch. Historical workflow
// surfaces still live here, but new work should move loading/effects into
// the surface it touches instead of growing this component.
