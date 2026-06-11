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
  // Bare /matters/:slug lands on Chat — opening a matter feels like
  // opening a project folder where work happens, with documents and
  // the record one click away. The previous documents-first default
  // surfaced the file cabinet before the work, contra blueprint §4A.2.
  const initialTab: TabKey =
    route.name === "detail" && route.tab && isTabKey(route.tab) ? route.tab : "assistant";
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
  // lands on Chat.
  useEffect(() => {
    if (route.name === "detail" && route.tab && isTabKey(route.tab)) {
      setTab(route.tab);
    } else if (route.name === "detail" && !route.tab) {
      setTab("assistant");
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
    <div className="flex-1 min-w-0">
        <div className="flex">
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-12 py-12">
          {error && matter && <ErrorCallout message={error} compact />}
          {matter && (
            <PostureBanner
              posture={matter.privilege_posture}
              user={auth.user}
              firmRoleGatesEnabled={firmRoleGates}
              onChangePosture={onPostureChange}
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
            />
          )}
          {tab === "documents" && (
            <DocumentsTab slug={slug} docs={docs} onUpload={onUpload} />
          )}
          {tab === "chronology" && (
            <ChronologyTab
              chron={chron}
              showSoF={showSoF}
              setShowSoF={setShowSoF}
              onConfirmGate={onConfirmGate}
            />
          )}
          {tab === "workflows" && (
            <div className="space-y-8">
              <MatterSkillsTab slug={matter.slug} />
              <details className="border-t border-rule pt-6">
                <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted hover:text-ink">
                  Permissions detail
                </summary>
                <p className="mt-2 text-xs text-muted">
                  Direct grant management. The simplified view above is
                  the primary surface for this matter; this section
                  exists for operators who need to inspect or edit
                  specific capability grants.
                </p>
                <div className="mt-6 space-y-8">
                  <GrantsPanel
                    slug={matter.slug}
                    defaultModelId={matter.default_model_id}
                    requiredProvider={matter.required_provider}
                  />
                </div>
              </details>
            </div>
          )}
          {tab === "audit" && <AuditTab audit={audit} matter={matter} />}
          {tab === "approvals" && <ApprovalsTab slug={matter.slug} />}
        </main>
        </div>
    </div>
  );
}

// MatterDetail should stay a shell + tab switch. Historical workflow
// surfaces still live here, but new work should move loading/effects into
// the surface it touches instead of growing this component.
