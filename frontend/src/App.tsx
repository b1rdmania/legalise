import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  BACKEND_ROOT,
  confirmGate,
  createMatter,
  draftLetter,
  exportPreMotionPdf,
  getChronology,
  getLetterCatalogue,
  getMatter,
  getModules,
  getSkillBody,
  listAudit,
  listDocuments,
  listMatters,
  signout,
  runPreMotionStream,
  setPrivilege,
  uploadDocument,
  type AuditEntry,
  type ChronologyResponse,
  type LetterCatalogue,
  type LetterDraft,
  type Matter,
  type MatterDocument,
  type ModuleSkill,
  type ModulesResponse,
  type PreMotionRunResult,
} from "./lib/api";
import { navigate, useRoute, type Route } from "./lib/route";

// -- types -------------------------------------------------------------------

type StageProgress = {
  index: number;
  stage: string;
  sub_agent_count: number;
  status: "running" | "done" | "error";
  duration_ms?: number;
  token_count?: number;
  errors?: string[];
};

type TabKey = "overview" | "documents" | "chronology" | "premotion" | "letters" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "chronology", label: "Chronology" },
  { key: "premotion", label: "Pre-Motion" },
  { key: "letters", label: "Letters" },
  { key: "audit", label: "Audit" },
];

type HealthResponse = { status: string; version: string; database: string; environment: string };

// Seeded matter slug from backend/app/core/seed.py. Authenticated users land
// here directly; unauthenticated visitors are routed to signup first because
// /api/matters/{slug} and friends are auth-gated. Day D will copy Khan into
// each user's workspace on signup.
const DEMO_SLUG = "khan-v-acme-trading-2026";
// Authed CTA target lands in Day C once useAuth is wired (this constant is
// referenced by the future authed branch). Day D ships the post-signup Khan
// copy, at which point this becomes the matter under the user's own scope.
export const DEMO_HREF_AUTHED = `#/matters/${DEMO_SLUG}`;
const DEMO_HREF_UNAUTHED = "#/auth/signup";
const GITHUB_REPO = "https://github.com/b1rdmania/legalise";
const GITHUB_DOCS = "https://github.com/b1rdmania/legalise/tree/master/docs";

// -- app shell ---------------------------------------------------------------

export default function App() {
  const route = useRoute();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [drawerMatter, setDrawerMatter] = useState<Matter | null>(null);
  const [drawerTab, setDrawerTab] = useState<TabKey>("overview");

  useEffect(() => {
    fetch(`${BACKEND_ROOT}/health`)
      .then((r) => r.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  // body-scroll-lock + esc to close
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  // reset drawer matter scope when leaving a detail route
  useEffect(() => {
    if (route.name !== "detail") setDrawerMatter(null);
  }, [route]);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink pt-[64px] sm:pt-[80px]">
      <TopBar
        route={route}
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        drawerMatter={drawerMatter}
        drawerTab={drawerTab}
      />
      <Drawer
        route={route}
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        matter={drawerMatter}
        health={health}
      />
      <main className="flex-1">
        {route.name === "landing" && <Landing />}
        {route.name === "modules" && <Modules />}
        {route.name === "list" && <MatterList />}
        {route.name === "new" && <NewMatter />}
        {route.name === "detail" && (
          <MatterDetail
            slug={route.slug}
            onMatterLoaded={setDrawerMatter}
            onTabChange={setDrawerTab}
          />
        )}
        {route.name === "signin" && (
          <StubSurface
            eyebrow="AUTH — SIGN IN"
            heading="Sign in"
            body="Auth pages land in Day C. Day A and B (backend) are signed off; Day C ships the React surfaces on top."
          />
        )}
        {route.name === "signup" && (
          <StubSurface
            eyebrow="AUTH — SIGN UP"
            heading="Sign up"
            body="Auth pages land in Day C. Day A and B (backend) are signed off; Day C ships the React surfaces on top."
          />
        )}
        {route.name === "forgot" && (
          <StubSurface
            eyebrow="AUTH — FORGOT PASSWORD"
            heading="Forgot password"
            body="Auth pages land in Day C. Day A and B (backend) are signed off; Day C ships the React surfaces on top."
          />
        )}
        {route.name === "reset" && (
          <StubSurface
            eyebrow="AUTH — RESET PASSWORD"
            heading="Reset password"
            body="Auth pages land in Day C. Day A and B (backend) are signed off; Day C ships the React surfaces on top."
          />
        )}
        {route.name === "verifyPending" && (
          <StubSurface
            eyebrow="AUTH — VERIFY EMAIL"
            heading="Check your email"
            body="Auth pages land in Day C. Day A and B (backend) are signed off; Day C ships the React surfaces on top."
          />
        )}
        {route.name === "verify" && (
          <StubSurface
            eyebrow="AUTH — VERIFY EMAIL"
            heading="Verify email"
            body="Auth pages land in Day C. Day A and B (backend) are signed off; Day C ships the React surfaces on top."
          />
        )}
        {route.name === "settings" && (
          <StubSurface
            eyebrow={`SETTINGS — ${route.tab.toUpperCase()}`}
            heading={`Settings · ${route.tab}`}
            body="Settings tabs (Profile / API keys / Preferences) land in Day C alongside the auth surfaces."
          />
        )}
      </main>
    </div>
  );
}

// -- TopBar (P1) + dense-data variant (P18) ---------------------------------

function TopBar({
  route,
  navOpen,
  setNavOpen,
  drawerMatter,
  drawerTab,
}: {
  route: Route;
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
  drawerMatter: Matter | null;
  drawerTab: TabKey;
}) {
  // DEMO_SLUG is the seed matter slug — hardcoded so the public landing CTA
  // works without hitting the auth-gated /api/matters endpoint.
  const isDetail = route.name === "detail";
  const isModules = route.name === "modules";
  const isList = route.name === "list";

  const surfaceLabel = TABS.find((t) => t.key === drawerTab)?.label ?? "";

  return (
    <>
      {/* Dense-data variant — mobile, on matter detail */}
      {isDetail && drawerMatter && (
        <header className="fixed inset-x-0 top-0 z-40 bg-paper border-b border-rule md:hidden">
          <div className="px-4 h-[64px] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="flex items-center gap-2 text-ink min-h-[44px]"
              aria-label="Open menu"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M10 4l-4 4 4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                />
              </svg>
              <span className="text-[16px] font-medium truncate max-w-[180px]">
                {drawerMatter.slug}
              </span>
            </button>
            <span className="eyebrow-sm">{surfaceLabel}</span>
          </div>
        </header>
      )}

      {/* Default P1 header */}
      <header
        className={
          "fixed inset-x-0 top-0 z-50 bg-paper border-b border-rule " +
          (isDetail && drawerMatter ? "hidden md:block" : "")
        }
      >
        <div className="max-w-page mx-auto px-4 sm:px-6 h-[64px] sm:h-[80px] flex items-center justify-between">
          <a href="#/" className="flex items-center gap-3 group outline-none">
            <BrandMark />
            <span className="font-bold text-lg tracking-tight2 text-ink mt-0.5">LEGALISE</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink">
            <a
              href="#/modules"
              className={
                "transition-colors " + (isModules ? "text-ink font-semibold" : "text-ink hover:text-muted")
              }
            >
              Modules
            </a>
            <a
              href="#/matters"
              className={
                "transition-colors " + (isList ? "text-ink font-semibold" : "text-ink hover:text-muted")
              }
            >
              Matters
            </a>
            <a
              href={DEMO_HREF_UNAUTHED}
              className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors"
            >
              Open demo matter
            </a>
          </nav>
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="md:hidden min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}

function BrandMark() {
  // simple 24×24 ink-on-paper mark — block "M" so brand stamp reads as a workmark
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="2" />
      <path d="M7 17V7l5 6 5-6v10" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" />
    </svg>
  );
}

// -- Drawer (P18) -----------------------------------------------------------

function Drawer({
  route,
  navOpen,
  setNavOpen,
  matter,
  health,
}: {
  route: Route;
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
  matter: Matter | null;
  health: HealthResponse | null;
}) {
  if (!navOpen) return null;

  const isDetail = route.name === "detail";
  const isModules = route.name === "modules";
  const isList = route.name === "list" || route.name === "new";
  const isSettings = route.name === "settings";
  const close = () => setNavOpen(false);

  const onSignOut = async () => {
    try {
      await signout();
    } catch {
      // even if the call fails (already signed out, network), get back to landing
    }
    setNavOpen(false);
    navigate("/");
  };

  // P18 drawer item sets — match docs/DESIGN.md §P18 §"Drawer items by state".
  type Item = {
    href?: string;
    label: string;
    active?: boolean;
    external?: boolean;
    onClick?: () => void;
  };
  let primary: Item[] = [];
  let secondary: Item[] = [];

  if (isDetail && matter) {
    // Workspace + matter in scope: tabs · — · Modules · Settings · Sign out
    const currentTab = (route.name === "detail" ? route.tab : undefined) ?? "overview";
    primary = TABS.map((t) => ({
      href: `#/matters/${matter.slug}${t.key === "overview" ? "" : `/${t.key}`}`,
      label: t.label,
      active: currentTab === t.key,
    }));
    secondary = [
      { href: "#/modules", label: "Modules" },
      { href: "#/settings/profile", label: "Settings" },
      { label: "Sign out", onClick: onSignOut },
    ];
  } else if (isModules || isList || isSettings) {
    // Workspace no matter: Matters · Modules · — · Settings · Sign out
    primary = [
      { href: "#/matters", label: "Matters", active: isList },
      { href: "#/modules", label: "Modules", active: isModules },
    ];
    secondary = [
      { href: "#/settings/profile", label: "Settings", active: isSettings },
      { label: "Sign out", onClick: onSignOut },
    ];
  } else {
    // Marketing: Modules · Docs · GitHub · — · Open demo matter · Sign in
    // "Open demo matter" routes to signup until Day D lands the post-signup
    // Khan copy. Visible label preserved per DESIGN.md.
    primary = [
      { href: "#/modules", label: "Modules" },
      { href: GITHUB_DOCS, label: "Docs", external: true },
      { href: GITHUB_REPO, label: "GitHub", external: true },
    ];
    secondary = [
      { href: DEMO_HREF_UNAUTHED, label: "Open demo matter" },
      { href: "#/auth/signin", label: "Sign in" },
    ];
  }

  return (
    <>
      <div
        onClick={close}
        className="md:hidden fixed inset-0 z-50 bg-ink/40"
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="md:hidden fixed inset-y-0 left-0 z-50 w-[min(320px,86vw)] bg-paper border-r border-rule flex flex-col overflow-y-auto"
      >
        <div className="h-[64px] px-4 flex items-center justify-between border-b border-rule">
          <span className="font-bold text-lg tracking-tight2 text-ink">LEGALISE</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-muted"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {isDetail && matter && (
          <div className="px-4 py-3 border-b border-rule">
            <div className="eyebrow-sm mb-1">Matter</div>
            <div className="text-[16px] font-semibold text-ink truncate">{matter.slug}</div>
            <div className="text-xs text-muted mt-1">posture {matter.privilege_posture}</div>
          </div>
        )}

        <nav className="flex flex-col py-2">
          {primary.map((item) => (
            <DrawerItem
              key={(item.href ?? "btn") + item.label}
              item={item}
              tone="primary"
              onNavigate={() => setNavOpen(false)}
            />
          ))}
        </nav>

        {secondary.length > 0 && (
          <>
            <div className="my-2 border-t border-rule" />
            <nav className="flex flex-col py-2">
              {secondary.map((item) => (
                <DrawerItem
                  key={(item.href ?? "btn") + item.label}
                  item={item}
                  tone="secondary"
                  onNavigate={() => setNavOpen(false)}
                />
              ))}
            </nav>
          </>
        )}

        {health && (
          <div className="mt-auto border-t border-rule">
            <div className="text-xs text-muted px-4 py-3">
              {health.database === "ok" ? "lhr1" : "unreachable"} · v{health.version}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function DrawerItem({
  item,
  tone,
  onNavigate,
}: {
  item: {
    href?: string;
    label: string;
    active?: boolean;
    external?: boolean;
    onClick?: () => void;
  };
  tone: "primary" | "secondary";
  onNavigate: () => void;
}) {
  const primaryCls =
    "px-4 py-3 text-[16px] flex items-center gap-3 text-left " +
    (item.active
      ? "bg-wash text-ink font-semibold border-l-2 border-ink -ml-[2px] pl-[18px]"
      : "text-ink hover:bg-wash");
  const secondaryCls =
    "px-4 py-3 text-[16px] text-left " +
    (item.active
      ? "bg-wash text-ink font-semibold border-l-2 border-ink -ml-[2px] pl-[18px]"
      : "text-muted hover:text-ink hover:bg-wash");
  const cls = tone === "primary" ? primaryCls : secondaryCls;

  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          item.onClick!();
        }}
        className={cls}
      >
        <span>{item.label}</span>
      </button>
    );
  }
  return (
    <a
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noreferrer" : undefined}
      onClick={onNavigate}
      className={cls}
    >
      <span>{item.label}</span>
    </a>
  );
}

// -- Landing ----------------------------------------------------------------

function Landing() {
  // Unauthenticated CTA — Day D will copy Khan into the new user's workspace
  // on signup. Authenticated users using the drawer / TopBar still get routed
  // to the matter directly once useAuth lands in Day C.
  const onOpenDemo = () => navigate("/auth/signup");

  const parts: { name: string; body: string }[] = [
    {
      name: "Catalogue",
      body: "Plain-text SKILL.md files. claude-for-uk-legal is the default catalogue: fork it, review changes by PR diff, pin an approved SHA.",
    },
    {
      name: "Bridge",
      body: "Loads SKILL.md, injects matter context, dispatches through the privilege-aware model gateway, and writes plugin.invoked + model.call audit rows.",
    },
    {
      name: "Surfaces",
      body: "Three proven render patterns: generic invoke, curated multi-skill selection (Letters), and bespoke orchestration (Pre-Motion fans out across 4 stages, 9 calls). Surfaces are proof, not identity.",
    },
    {
      name: "Discovery",
      body: "The installed skills page shows what is present at PLUGINS_ROOT, grouped by plugin, with source links and prompt bodies for review.",
    },
    {
      name: "Install / approval",
      body: "Installation is Git: fork the catalogue, approve prompt changes in code review, pin PLUGINS_REPO_REF, deploy. No ratings, no marketplace database.",
    },
  ];

  const trust: string[] = [
    "Audit log per LLM call and per matter mutation, append-only by convention in v0.1.",
    "Privilege posture is a first-class matter property — A_cleared / B_mixed / C_paused — read by the gateway before any model call.",
    "CPR 31.22 gate on chronology entries sourced from disclosed documents — server-side, not UI.",
    "Local-model toggle in self-host: point the gateway at Ollama or vLLM, keep frontier models for A_cleared only.",
  ];

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-16">
      <div className="max-w-4xl">
        {/* P3 hero */}
        <div className="mb-16">
          <div className="eyebrow font-mono text-muted mb-4">VERSION 0.1 — MAY 2026</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6 leading-[1.05]">
            Legalise turns reviewable legal skills into audited matter workflows.
          </h1>
          <p className="text-xl text-muted leading-relaxed max-w-2xl">
            Open-source UK legal AI workspace. SKILL.md files, matter context, audit log per LLM
            call, CPR 31.22 gate on disclosed material. Skills come from{" "}
            <span className="text-ink">claude-for-uk-legal</span> by default; fork the catalogue,
            review the skills, point <span className="text-ink">PLUGINS_ROOT</span> at your fork.
            Approval is code review. Provenance is git history.
          </p>

          <div className="flex flex-wrap gap-x-10 gap-y-4 mt-10 pb-10 border-b border-rule">
            <div>
              <div className="eyebrow mb-1.5">Author</div>
              <div className="text-sm font-semibold">Andy Bird</div>
            </div>
            <div>
              <div className="eyebrow mb-1.5">License</div>
              <div className="text-sm font-semibold">Apache 2.0</div>
            </div>
            <div>
              <div className="eyebrow mb-1.5">Status</div>
              <div className="text-sm font-semibold text-[#00A35C]">v0.1 demo</div>
            </div>
          </div>

          {/* P12 buttons */}
          <div className="flex flex-wrap items-center gap-4 mt-8">
            <button
              onClick={onOpenDemo}
              className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px]"
            >
              Open demo matter
            </button>
            <a
              href="#/modules"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Installed skills
            </a>
            <a
              href="#/matters"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              All matters
            </a>
            <a
              href="https://github.com/b1rdmania/legalise"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              GitHub
            </a>
          </div>

        </div>

        {/* Five parts — P7 em-dash list */}
        <section className="mb-24">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            01. Execution layer — five parts
          </h2>
          <p className="prose-p">
            The execution layer is a small, named set of moving parts. Each is replaceable; none
            is a marketplace.
          </p>
          <ul className="list-none space-y-6 text-prose pl-0">
            {parts.map((p) => (
              <li key={p.name} className="flex items-start gap-4">
                <span className="text-ink font-bold">—</span>
                <span>
                  <strong className="text-ink font-semibold">{p.name}.</strong> {p.body}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Trust posture */}
        <section className="mb-24">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            02. Trust posture
          </h2>
          <div className="bg-wash p-8 border-l-4 border-ink my-8">
            <p className="text-sm font-medium italic m-0">
              "If a matter has disclosure-tainted entries, the user must acknowledge the implied
              undertaking before those entries become readable. This is enforced server-side,
              not in the UI."
            </p>
          </div>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {trust.map((t, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-bold text-ink">—</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="prose-p mt-8">
            Honest about v0.1 limits: single hardcoded user; retention recorded but not enforced;
            append-only audit log by convention not by Postgres grant. See{" "}
            <a
              href="https://github.com/b1rdmania/legalise/blob/master/docs/TRUST.md"
              target="_blank"
              rel="noreferrer"
              className="text-[#0066CC] hover:underline"
            >
              docs/TRUST.md
            </a>
            .
          </p>
        </section>

        <Footer />
      </div>
    </div>
  );
}

// -- Modules ----------------------------------------------------------------

function Modules() {
  const [data, setData] = useState<ModulesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [promptBody, setPromptBody] = useState<Record<string, string>>({});
  const [promptError, setPromptError] = useState<Record<string, string>>({});

  useEffect(() => {
    getModules()
      .then((d) => {
        setData(d);
        if (d.skills.length > 0) {
          const first = d.skills[0];
          setSelectedKey(`${first.plugin}/${first.skill}`);
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  // load prompt body when selection changes
  useEffect(() => {
    if (!selectedKey || !data) return;
    if (promptBody[selectedKey] || promptError[selectedKey]) return;
    const [plugin, skill] = selectedKey.split("/", 2);
    getSkillBody(plugin, skill)
      .then((body) => setPromptBody((prev) => ({ ...prev, [selectedKey]: body })))
      .catch((e) => setPromptError((prev) => ({ ...prev, [selectedKey]: String(e) })));
  }, [selectedKey, data, promptBody, promptError]);

  const grouped = useMemo(() => {
    const m = new Map<string, ModuleSkill[]>();
    for (const skill of data?.skills ?? []) {
      const rows = m.get(skill.plugin) ?? [];
      rows.push(skill);
      m.set(skill.plugin, rows);
    }
    return m;
  }, [data]);

  const selectedSkill = useMemo(() => {
    if (!selectedKey || !data) return null;
    return data.skills.find((s) => `${s.plugin}/${s.skill}` === selectedKey) ?? null;
  }, [selectedKey, data]);

  const shortRef = data?.source.ref ? data.source.ref.slice(0, 7) : "unversioned";

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
      {error && <ErrorCallout message={error} />}
      {!data && !error && <LoadingLine label="loading installed skills" />}

      {data && data.skills.length === 0 && (
        <div className="bg-yellow-100 border border-rule p-4 text-ink text-sm">
          No SKILL.md files found under {data.plugins_root}.
        </div>
      )}

      {data && data.skills.length > 0 && (
        <div className="flex gap-12">
          {/* P2 sidebar TOC */}
          <aside className="hidden lg:block w-80 sticky top-[88px] h-[calc(100vh-100px)] border-r border-rule pr-8 overflow-y-auto">
            <div className="eyebrow-sm mb-8">Installed skills</div>
            {Array.from(grouped.entries()).map(([plugin, skills]) => (
              <div key={plugin} className="mb-8">
                <div className="eyebrow-sm mb-4">{plugin}</div>
                <nav className="flex flex-col gap-1">
                  {skills.map((s) => {
                    const key = `${s.plugin}/${s.skill}`;
                    const active = selectedKey === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedKey(key)}
                        className={
                          "py-2 border-l-2 pl-4 text-sm transition-all text-left " +
                          (active
                            ? "border-ink text-ink font-semibold"
                            : "border-transparent text-muted hover:text-ink")
                        }
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
            <div className="mt-12 pt-8 border-t border-rule">
              <div className="eyebrow-sm mb-4">Catalogue</div>
              <ul className="flex flex-col gap-3 text-sm">
                <li>
                  <span className="text-muted">root</span>{" "}
                  <span className="text-ink font-mono text-xs break-all">{data.plugins_root}</span>
                </li>
                <li>
                  <span className="text-muted">repo</span>{" "}
                  <span className="text-ink font-mono text-xs break-all">
                    {data.source.repo ?? "unset"}
                  </span>
                </li>
                <li>
                  <span className="text-muted">ref</span>{" "}
                  <span className="text-ink font-mono text-xs">{shortRef}</span>
                </li>
              </ul>
            </div>
          </aside>

          {/* Main column */}
          <main className="flex-1 min-w-0">
            {/* Mobile fallback — stacked list */}
            <div className="lg:hidden space-y-12">
              {Array.from(grouped.entries()).map(([plugin, skills]) => (
                <section key={plugin}>
                  <div className="eyebrow-sm mb-4">{plugin}</div>
                  {skills.map((s) => {
                    const key = `${s.plugin}/${s.skill}`;
                    return (
                      <article key={key} className="mb-12 pb-12 border-b border-rule last:border-b-0">
                        <SkillBlock
                          skill={s}
                          body={promptBody[key]}
                          error={promptError[key]}
                          onLoad={() => setSelectedKey(key)}
                          isLoaded={!!promptBody[key] || !!promptError[key]}
                        />
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>

            {/* Desktop — single selected skill */}
            <div className="hidden lg:block">
              {selectedSkill && (
                <SkillBlock
                  skill={selectedSkill}
                  body={promptBody[selectedKey!]}
                  error={promptError[selectedKey!]}
                  onLoad={() => undefined}
                  isLoaded={!!promptBody[selectedKey!] || !!promptError[selectedKey!]}
                />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function SkillBlock({
  skill,
  body,
  error,
  onLoad,
  isLoaded,
}: {
  skill: ModuleSkill;
  body: string | undefined;
  error: string | undefined;
  onLoad: () => void;
  isLoaded: boolean;
}) {
  useEffect(() => {
    if (!isLoaded) onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mb-8">
        <div className="eyebrow font-mono text-muted mb-4">
          INSTALLED SKILL — {skill.plugin}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1] mb-4">
          {skill.name}
        </h1>
        <p className="text-xl text-muted leading-relaxed max-w-2xl">{skill.description}</p>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-4 mb-10 pb-10 border-b border-rule">
        <div>
          <div className="eyebrow mb-1.5">Plugin</div>
          <div className="text-sm font-semibold font-mono">{skill.plugin}</div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Skill</div>
          <div className="text-sm font-semibold font-mono">{skill.skill}</div>
        </div>
        {skill.argument_hint && (
          <div>
            <div className="eyebrow mb-1.5">Arguments</div>
            <div className="text-sm font-semibold font-mono">{skill.argument_hint}</div>
          </div>
        )}
        {skill.source_url && (
          <div>
            <div className="eyebrow mb-1.5">Source</div>
            <a
              href={skill.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-[#0066CC] hover:underline break-all"
            >
              view
            </a>
          </div>
        )}
      </div>

      {error && <ErrorCallout message={error} compact />}
      {!body && !error && <LoadingLine label="loading prompt body" />}
      {body && (
        <pre className="bg-wash border border-rule font-mono text-[13px] p-6 my-4 overflow-x-auto whitespace-pre max-h-[60vh]">
          {body}
        </pre>
      )}
    </>
  );
}

// -- MatterList -------------------------------------------------------------

function MatterList() {
  const [matters, setMatters] = useState<Matter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMatters()
      .then((rows) => setMatters(rows))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow font-mono text-muted mb-4">MATTERS</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1]">
            All matters.
          </h1>
          {matters && (
            <p className="text-sm text-muted mt-3">
              {matters.length} record{matters.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <a
          href="#/matters/new"
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
        >
          New matter
        </a>
      </div>

      {error && <ErrorCallout message={error} />}

      {matters && matters.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">
          No matters yet —{" "}
          <a
            href="#/matters/new"
            className="text-ink underline hover:text-muted"
          >
            create one
          </a>
          .
        </div>
      )}

      {matters && matters.length > 0 && (
        <div className="border-t border-rule overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1fr_180px_120px_140px] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
              <span>Slug</span>
              <span>Type</span>
              <span>Status</span>
              <span>Opened</span>
            </div>
            {matters.map((m) => (
              <a
                key={m.id}
                href={`#/matters/${m.slug}`}
                className="grid grid-cols-[1fr_180px_120px_140px] gap-4 px-4 py-3 border-b border-rule hover:bg-wash transition-colors font-mono text-[11px]"
              >
                <span className="text-ink font-bold truncate">{m.slug}</span>
                <span className="text-prose truncate">{m.matter_type}</span>
                <span>
                  <StatusBadge status={m.status} />
                </span>
                <span className="text-ink">{m.opened_at.slice(0, 10)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -- NewMatter --------------------------------------------------------------

function NewMatter() {
  const [form, setForm] = useState({
    title: "",
    matter_type: "employment_tribunal",
    cause: "s.94 ERA 1996, unfair dismissal",
    case_theory: "",
    pivot_fact: "",
    privilege_posture: "B_mixed",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const matter = await createMatter(form);
      navigate(`/matters/${matter.slug}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "bg-paper border border-rule px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-none transition-colors min-h-[44px] font-sans text-ink w-full";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-10">
        <div className="eyebrow font-mono text-muted mb-4">MATTERS — NEW</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1]">
          New matter.
        </h1>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <Field label="Title" hint="becomes the slug">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Khan v Acme Trading Ltd"
            className={inputCls}
          />
        </Field>

        <Field label="Matter type">
          <input
            value={form.matter_type}
            onChange={(e) => setForm({ ...form, matter_type: e.target.value })}
            className={inputCls}
          />
        </Field>

        <Field label="Cause">
          <input
            value={form.cause}
            onChange={(e) => setForm({ ...form, cause: e.target.value })}
            className={inputCls}
          />
        </Field>

        <Field label="Case theory" hint="optional">
          <textarea
            rows={4}
            value={form.case_theory}
            onChange={(e) => setForm({ ...form, case_theory: e.target.value })}
            className={inputCls + " resize-y"}
          />
        </Field>

        <Field label="Pivot fact" hint="optional">
          <input
            value={form.pivot_fact}
            onChange={(e) => setForm({ ...form, pivot_fact: e.target.value })}
            className={inputCls}
          />
        </Field>

        <Field label="Privilege posture">
          <select
            value={form.privilege_posture}
            onChange={(e) => setForm({ ...form, privilege_posture: e.target.value })}
            className={inputCls}
          >
            <option value="A_cleared">A_cleared — frontier models allowed</option>
            <option value="B_mixed">B_mixed — default, local preferred</option>
            <option value="C_paused">C_paused — LLM calls blocked</option>
          </select>
        </Field>

        {error && <ErrorCallout message={error} />}

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting || !form.title}
            className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Create matter"}
          </button>
          <a
            href="#/matters"
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

// -- MatterDetail -----------------------------------------------------------

function MatterDetail({
  slug,
  onMatterLoaded,
  onTabChange,
}: {
  slug: string;
  onMatterLoaded: (m: Matter | null) => void;
  onTabChange: (t: TabKey) => void;
}) {
  const route = useRoute();
  const initialTab: TabKey =
    route.name === "detail" && route.tab && isTabKey(route.tab) ? route.tab : "overview";
  const [tab, setTab] = useState<TabKey>(initialTab);

  // sync tab → drawer label
  useEffect(() => {
    onTabChange(tab);
  }, [tab, onTabChange]);

  // sync tab from hash when it changes (back/forward)
  useEffect(() => {
    if (route.name === "detail" && route.tab && isTabKey(route.tab)) {
      setTab(route.tab);
    } else if (route.name === "detail" && !route.tab) {
      setTab("overview");
    }
  }, [route]);

  const setTabAndHash = (next: TabKey) => {
    setTab(next);
    const target =
      next === "overview" ? `/matters/${slug}` : `/matters/${slug}/${next}`;
    if (`#${target}` !== window.location.hash) navigate(target);
  };

  const [matter, setMatter] = useState<Matter | null>(null);
  const [docs, setDocs] = useState<MatterDocument[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [premotion, setPremotion] = useState<PreMotionRunResult | null>(null);
  const [premotionRunning, setPremotionRunning] = useState(false);
  const [premotionError, setPremotionError] = useState<string | null>(null);
  const [premotionStages, setPremotionStages] = useState<StageProgress[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [chron, setChron] = useState<ChronologyResponse | null>(null);
  const [showSoF, setShowSoF] = useState(false);
  const [letterCat, setLetterCat] = useState<LetterCatalogue | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [letterDraft, setLetterDraft] = useState<LetterDraft | null>(null);
  const [letterDrafting, setLetterDrafting] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);

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
        "I confirm the CPR 31.22 implied undertaking — disclosed material is used only for these proceedings.",
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
      setPremotionError(String(err));
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

  const onDraftLetter = async () => {
    if (!selectedLetter) return;
    setLetterDrafting(true);
    setLetterError(null);
    setLetterDraft(null);
    try {
      const draft = await draftLetter(slug, selectedLetter);
      setLetterDraft(draft);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setLetterError(String(err));
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
          href="#/matters"
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
      setError(String(err));
    }
  };

  return (
    <div className="max-w-page mx-auto">
      {/* P8 panel header */}
      <PanelHeader matter={matter} onPostureChange={onPostureChange} />
      {/* P9 tab bar */}
      <TabBar tab={tab} onChange={setTabAndHash} />

      <div className="px-4 sm:px-6 lg:px-10 py-8">
        {error && matter && <ErrorCallout message={error} compact />}
        {tab === "overview" && <OverviewTab matter={matter} />}
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
        {tab === "premotion" && (
          <PremotionTab
            matter={matter}
            running={premotionRunning}
            error={premotionError}
            stages={premotionStages}
            result={premotion}
            onRun={onRunPremotion}
            pdfBusy={pdfBusy}
            pdfError={pdfError}
            onExportPdf={onExportPdf}
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
            draft={letterDraft}
            onDraft={onDraftLetter}
          />
        )}
        {tab === "audit" && <AuditTab audit={audit} />}
      </div>
    </div>
  );
}

function isTabKey(v: string): v is TabKey {
  return ["overview", "documents", "chronology", "premotion", "letters", "audit"].includes(v);
}

// -- PanelHeader (P8) -------------------------------------------------------

function PanelHeader({
  matter,
  onPostureChange,
}: {
  matter: Matter;
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

// -- TabBar (P9) ------------------------------------------------------------

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

// -- OverviewTab ------------------------------------------------------------

function OverviewTab({ matter }: { matter: Matter }) {
  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap gap-x-10 gap-y-4 mb-10 pb-10 border-b border-rule">
        <div>
          <div className="eyebrow mb-1.5">Cause</div>
          <div className="text-sm font-semibold text-ink">{matter.cause ?? "—"}</div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Opened</div>
          <div className="text-sm font-semibold text-ink">{matter.opened_at.slice(0, 10)}</div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Retention</div>
          <div className="text-sm font-semibold text-ink">
            {matter.retention_until?.slice(0, 10) ?? "—"}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Status</div>
          <div className="text-sm font-semibold text-ink">{matter.status}</div>
        </div>
      </div>

      {matter.pivot_fact && (
        <div className="bg-wash p-8 border-l-4 border-ink my-8">
          <div className="eyebrow mb-3">Pivot fact</div>
          <p className="text-sm font-medium italic m-0 text-ink whitespace-pre-wrap">
            {matter.pivot_fact}
          </p>
        </div>
      )}

      {matter.case_theory && (
        <section className="prose mb-12">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            01. Theory of case
          </h2>
          <p className="prose-p whitespace-pre-wrap">{matter.case_theory}</p>
        </section>
      )}

      {!matter.case_theory && !matter.pivot_fact && (
        <p className="prose-p">
          No case theory recorded yet. Theory and pivot fact set at matter creation feed downstream
          Pre-Motion synthesis and letter drafting.
        </p>
      )}

      {/* Contract Review v0.2 callout */}
      <div className="bg-wash border-l-4 border-ink p-6 my-12">
        <div className="eyebrow mb-3">ROADMAP — v0.2</div>
        <p className="text-sm text-ink leading-relaxed">
          Contract review graduates from counsel-mvp in v0.2. Four-agent orchestration over uploaded
          contracts — Parser, Analyst, Redliner, Summariser — same shape as Pre-Motion's bespoke
          pipeline. See{" "}
          <a
            href="https://github.com/b1rdmania/legalise/blob/master/docs/ROADMAP.md"
            target="_blank"
            rel="noreferrer"
            className="text-[#0066CC] hover:underline"
          >
            docs/ROADMAP.md
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// -- DocumentsTab -----------------------------------------------------------

function DocumentsTab({
  docs,
  onUpload,
}: {
  docs: MatterDocument[] | null;
  onUpload: (file: File, tag?: string, fromDisclosure?: boolean) => void;
}) {
  const [tag, setTag] = useState("");
  const [fromDisclosure, setFromDisclosure] = useState(false);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(file, tag || undefined, fromDisclosure || undefined);
    e.target.value = "";
  };

  const inputCls =
    "bg-paper border border-rule px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-none transition-colors min-h-[44px] font-sans text-ink";

  return (
    <div>
      <form className="mb-10 flex flex-wrap items-end gap-4">
        <Field label="Tag" hint="optional — e.g. pleadings, disclosure">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={inputCls}
            placeholder="pleadings"
          />
        </Field>
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

      {!docs && <LoadingLine label="loading documents" />}
      {docs && docs.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">
          No documents registered yet.
        </div>
      )}
      {docs && docs.length > 0 && (
        <div className="border-t border-rule overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[110px_1fr_90px_120px_120px] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
              <span>SHA</span>
              <span>Filename</span>
              <span>Size</span>
              <span>Tag</span>
              <span>Disclosure</span>
            </div>
            {docs.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-[110px_1fr_90px_120px_120px] gap-4 px-4 py-3 border-b border-rule hover:bg-wash transition-colors font-mono text-[11px] items-center"
              >
                <span className="text-muted truncate">{d.sha256.slice(0, 8)}</span>
                <span className="text-ink truncate">{d.filename}</span>
                <span className="text-ink">{formatBytes(d.size_bytes)}</span>
                <span>{d.tag && <Badge>{d.tag.toUpperCase()}</Badge>}</span>
                <span>{d.from_disclosure && <Badge>CPR 31</Badge>}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -- ChronologyTab ----------------------------------------------------------

function ChronologyTab({
  chron,
  showSoF,
  setShowSoF,
  onConfirmGate,
}: {
  chron: ChronologyResponse | null;
  showSoF: boolean;
  setShowSoF: (v: boolean) => void;
  onConfirmGate: () => void;
}) {
  if (!chron) return <LoadingLine label="loading chronology" />;

  return (
    <div>
      {chron.gate.required && !chron.gate.confirmed && (
        <CprGateBanner count={chron.gate.tainted_event_count} onConfirm={onConfirmGate} />
      )}

      {chron.events.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">
          No events seeded. Live extraction lands v0.2.
        </div>
      )}

      {chron.events.length > 0 && (
        <>
          <div className="flex gap-4 border-b border-rule h-10 items-center mb-4">
            <ToggleButton active={!showSoF} onClick={() => setShowSoF(false)}>
              Full
            </ToggleButton>
            <ToggleButton active={showSoF} onClick={() => setShowSoF(true)}>
              Statement of facts
            </ToggleButton>
          </div>
          <ChronologyTable
            events={showSoF ? chron.statement_of_facts_variant : chron.events}
          />
          {chron.gate.confirmed && chron.gate.confirmed_at && (
            <p className="font-mono text-[11px] text-muted mt-4">
              cpr_31_22_acknowledged · {chron.gate.confirmed_at.slice(0, 19).replace("T", " ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ChronologyTable({
  events,
}: {
  events: import("./lib/api").ChronologyEvent[];
}) {
  return (
    <div className="border-t border-rule overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[110px_50px_1fr_220px] gap-4 px-4 py-2 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
          <span>Date</span>
          <span>Sig</span>
          <span>Event</span>
          <span>Source · flags</span>
        </div>
        {events.map((e) => {
        const sigBarWidth = `${Math.max(0, Math.min(100, (e.significance / 5) * 100))}%`;
        return (
          <div
            key={e.id}
            className="relative h-[22px] grid grid-cols-[110px_50px_1fr_220px] gap-4 items-center px-4 hover:bg-wash transition-colors text-[11px] font-mono border-b border-rule"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-[#00A35C]/15 pointer-events-none"
              style={{ width: sigBarWidth }}
              aria-hidden="true"
            />
            <span className="text-ink z-10 font-bold">{e.event_date}</span>
            <span className="text-muted z-10">{e.significance}</span>
            {e.redacted ? (
              <span className="text-[#D9304F] italic z-10 truncate">{e.description}</span>
            ) : (
              <span className="text-ink z-10 truncate">{e.description}</span>
            )}
            <span className="z-10 flex flex-wrap items-center gap-2 truncate">
              {e.source_doc_filenames.map((fn) => (
                <a
                  key={fn}
                  href="#"
                  onClick={(ev) => ev.preventDefault()}
                  className="text-muted hover:text-ink truncate max-w-[160px]"
                >
                  {fn}
                </a>
              ))}
              {e.from_disclosure && <Badge>CPR 31.22</Badge>}
              {e.priv_flag && <Badge>PRIV</Badge>}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// -- PremotionTab -----------------------------------------------------------

function PremotionTab({
  matter,
  running,
  error,
  stages,
  result,
  onRun,
  pdfBusy,
  pdfError,
  onExportPdf,
}: {
  matter: Matter;
  running: boolean;
  error: string | null;
  stages: StageProgress[];
  result: PreMotionRunResult | null;
  onRun: () => void;
  pdfBusy: boolean;
  pdfError: string | null;
  onExportPdf: () => void;
}) {
  const blocked = matter.privilege_posture === "C_paused";

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-prose max-w-2xl">
            Adversarial premortem. Optimistic Analyst → Evidence Inspector × 3 parallel sub-agents
            → Premortem Adversary × 4 parallel sub-agents → Synthesiser. Nine model calls per run,
            all audited.
          </p>
        </div>
        <button
          onClick={onRun}
          disabled={running || blocked}
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? "Running…" : "Run premortem"}
        </button>
      </div>

      {blocked && (
        <div className="bg-yellow-100 border border-rule p-4 text-ink text-sm mb-6">
          <div className="font-semibold mb-1">Privilege posture C_paused</div>
          LLM calls are blocked while the matter posture is paused. Change the posture in the
          header strip to run a premortem.
        </div>
      )}

      {error && <ErrorCallout message={error} compact />}

      {(running || stages.length > 0) && !result && <PremotionStageStrip stages={stages} />}

      {result && (
        <>
          <PremotionResult result={result} />
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={onExportPdf}
              disabled={pdfBusy}
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40"
            >
              {pdfBusy ? "Rendering PDF…" : "Export PDF"}
            </button>
          </div>
          {pdfError && (
            <div className="mt-4">
              <ErrorCallout message={pdfError} compact />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PremotionStageStrip({ stages }: { stages: StageProgress[] }) {
  const expected = [
    { index: 1, stage: "optimistic", sub_agent_count: 1 },
    { index: 2, stage: "evidence", sub_agent_count: 3 },
    { index: 3, stage: "premortem", sub_agent_count: 4 },
    { index: 4, stage: "synthesis", sub_agent_count: 1 },
  ];
  const byIndex = new Map(stages.map((s) => [s.index, s]));
  return (
    <div className="border border-rule mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {expected.map((e) => {
          const s = byIndex.get(e.index);
          const status = s?.status ?? "pending";
          const colour =
            status === "running"
              ? "text-[#E67E22]"
              : status === "done"
                ? "text-[#00A35C]"
                : status === "error"
                  ? "text-[#D9304F]"
                  : "text-muted";
          return (
            <div
              key={e.index}
              className="border-r border-rule last:border-r-0 border-b md:border-b-0 p-4"
            >
              <div className="eyebrow mb-2">{e.stage}</div>
              <div className={`text-xs font-mono font-bold ${colour}`}>
                {status === "running" && (
                  <span className="flex items-center gap-2">
                    <InlineSpinner />
                    running
                  </span>
                )}
                {status === "done" && (
                  <span>
                    {s!.sub_agent_count} call{s!.sub_agent_count === 1 ? "" : "s"} ·{" "}
                    {((s!.duration_ms ?? 0) / 1000).toFixed(1)}s · {s!.token_count ?? 0}t
                  </span>
                )}
                {status === "error" && <span>error · {s!.errors?.length ?? 1}</span>}
                {status === "pending" && <span>pending</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PremotionResult({ result }: { result: PreMotionRunResult }) {
  const verdictColour =
    result.synthesis.verdict === "steelman"
      ? "#00A35C"
      : result.synthesis.verdict === "strawman"
        ? "#D9304F"
        : "#E67E22";

  return (
    <div className="space-y-8">
      {/* verdict pill + meta */}
      <div>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <span
            className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold"
            style={{ borderColor: verdictColour, color: verdictColour }}
          >
            <span className="w-1.5 h-1.5" style={{ backgroundColor: verdictColour }} />
            {result.synthesis.verdict}
          </span>
          <span className="font-mono text-xs text-muted">
            {result.model_used} · {result.total_token_count} tok ·{" "}
            {(result.total_duration_ms / 1000).toFixed(1)}s
          </span>
        </div>
        <p className="prose-p">{result.synthesis.verdict_reasoning}</p>
        {result.synthesis.if_we_lose_this_will_be_why && (
          <div className="bg-wash p-8 border-l-4 border-ink my-8">
            <div className="eyebrow mb-3">If we lose, this will be why</div>
            <p className="text-sm font-medium italic m-0 text-ink">
              {result.synthesis.if_we_lose_this_will_be_why}
            </p>
          </div>
        )}
        {result.synthesis.summary && (
          <p className="prose-p whitespace-pre-wrap">{result.synthesis.summary}</p>
        )}
      </div>

      {/* failure scenarios */}
      {result.synthesis.failure_scenarios.length > 0 && (
        <section>
          <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            Failure scenarios
          </h3>
          <div className="border-t border-rule">
            {result.synthesis.failure_scenarios.map((fs, i) => (
              <div key={i} className="border-b border-rule py-4">
                <div className="flex items-center gap-3 mb-2">
                  <Badge>{fs.category.toUpperCase()}</Badge>
                  <span className="font-mono text-xs text-muted">
                    prob {fs.probability} · impact {fs.impact}
                  </span>
                </div>
                <p className="text-sm text-ink mb-2 leading-relaxed">{fs.scenario}</p>
                {fs.mitigation && (
                  <p className="text-sm text-prose leading-relaxed">
                    <span className="text-ink font-semibold">Mitigation —</span> {fs.mitigation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* blind spots */}
      {result.synthesis.blind_spots.length > 0 && (
        <section>
          <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">Blind spots</h3>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {result.synthesis.blind_spots.map((bs, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-bold text-ink">—</span>
                <span>{bs}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* evidence inconsistencies */}
      {result.synthesis.evidence_inconsistencies.length > 0 && (
        <section>
          <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            Evidence inconsistencies
          </h3>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {result.synthesis.evidence_inconsistencies.map((ei, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-bold text-ink">—</span>
                <span>
                  <Badge>{ei.severity.toUpperCase()}</Badge>{" "}
                  <strong className="text-ink font-semibold">{ei.claim}</strong> — {ei.issue}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* stage telemetry — dense rows */}
      <section>
        <h3 className="text-2xl font-bold tracking-tight2 text-ink mb-6">Stage telemetry</h3>
        <div className="border-t border-rule">
          <div className="grid grid-cols-[1fr_80px_100px_100px_80px] gap-4 px-4 py-2 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
            <span>Stage</span>
            <span>Calls</span>
            <span>Duration</span>
            <span>Tokens</span>
            <span>Errors</span>
          </div>
          {result.stages.map((s) => (
            <div
              key={s.name}
              className="grid grid-cols-[1fr_80px_100px_100px_80px] gap-4 px-4 py-3 border-b border-rule font-mono text-[11px] items-center"
            >
              <span className="text-ink font-bold">{s.name}</span>
              <span className="text-ink">{s.sub_agent_count}</span>
              <span className="text-ink">{(s.duration_ms / 1000).toFixed(1)}s</span>
              <span className="text-ink">{s.token_count}</span>
              <span className={s.errors.length ? "text-[#D9304F]" : "text-muted"}>
                {s.errors.length}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// -- LettersTab -------------------------------------------------------------

function LettersTab({
  matter,
  catalogue,
  selected,
  onSelect,
  drafting,
  error,
  draft,
  onDraft,
}: {
  matter: Matter;
  catalogue: LetterCatalogue | null;
  selected: string | null;
  onSelect: (id: string) => void;
  drafting: boolean;
  error: string | null;
  draft: LetterDraft | null;
  onDraft: () => void;
}) {
  const blocked = matter.privilege_posture === "C_paused";

  if (!catalogue) return <LoadingLine label="loading letter catalogue" />;

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-prose mb-6 max-w-2xl">
        Routed by matter type. ET matters surface{" "}
        <span className="text-ink font-mono text-xs">uk-employment-legal/lba-drafter</span> as
        default; civil matters surface{" "}
        <span className="text-ink font-mono text-xs">uk-litigation-legal/cpr-letter-drafter</span>.
      </p>

      {catalogue.letter_types.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">
          No letter skills mapped for matter_type={catalogue.matter_type}.
        </div>
      )}

      {catalogue.letter_types.length > 0 && (
        <>
          <div className="border-t border-rule mb-6">
            {catalogue.letter_types.map((lt) => {
              const active = selected === lt.id;
              return (
                <button
                  key={lt.id}
                  onClick={() => onSelect(lt.id)}
                  className={
                    "w-full text-left px-4 py-4 border-b border-rule last:border-b-0 block " +
                    (active
                      ? "bg-wash text-ink border-l-2 border-l-ink -ml-[2px] pl-[18px]"
                      : "hover:bg-wash")
                  }
                >
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <span className="text-sm font-semibold text-ink">{lt.label}</span>
                    {lt.is_default && <Badge>DEFAULT</Badge>}
                    <span className="font-mono text-xs text-muted ml-auto">
                      {lt.plugin}/{lt.skill}
                    </span>
                  </div>
                  <p className="text-sm text-prose leading-relaxed">{lt.summary}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={onDraft}
              disabled={drafting || blocked || !selected}
              className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {drafting ? "Drafting…" : draft ? "Re-draft letter" : "Draft letter"}
            </button>
            {blocked && (
              <span className="text-sm text-muted">
                Privilege posture C_paused blocks LLM calls.
              </span>
            )}
          </div>

          {error && <ErrorCallout message={error} compact />}

          {draft && (
            <div className="border border-rule">
              <div className="border-b border-rule px-4 py-3 flex flex-wrap items-center justify-between gap-4 bg-paper">
                <div className="flex items-center gap-4">
                  <span className="eyebrow">Draft</span>
                  <span className="font-mono text-xs text-ink">{draft.letter_type}</span>
                </div>
                <span className="font-mono text-xs text-muted">
                  {draft.model_used} · {draft.token_count} tok ·{" "}
                  {(draft.latency_ms / 1000).toFixed(1)}s
                </span>
              </div>
              <pre className="p-6 font-sans text-base leading-[1.7] text-ink whitespace-pre-wrap">
                {draft.draft_markdown}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// -- AuditTab ---------------------------------------------------------------

function AuditTab({ audit }: { audit: AuditEntry[] | null }) {
  if (!audit) return <LoadingLine label="loading audit" />;
  if (audit.length === 0)
    return (
      <div className="border border-rule p-6 text-sm text-muted">
        No entries yet — actions on this matter will appear here.
      </div>
    );

  return (
    <div className="border-t border-rule overflow-x-auto">
      <div className="min-w-[920px]">
        <div className="grid grid-cols-[180px_180px_140px_80px_80px_1fr] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
          <span>Timestamp</span>
          <span>Action</span>
          <span>Model</span>
          <span>Tokens</span>
          <span>Latency</span>
          <span>Payload</span>
        </div>
        {audit.map((e) => (
          <div
            key={e.id}
            className="grid grid-cols-[180px_180px_140px_80px_80px_1fr] gap-4 px-4 py-3 border-b border-rule hover:bg-wash transition-colors font-mono text-[11px] items-center"
          >
            <span className="text-ink">{e.timestamp.slice(0, 19).replace("T", " ")}</span>
            <span className="text-ink font-bold truncate">{e.action}</span>
            <span className="text-prose truncate">{e.model_used ?? "—"}</span>
            <span className="text-ink">{e.token_count ?? "—"}</span>
            <span className="text-ink">{e.latency_ms != null ? `${e.latency_ms}ms` : "—"}</span>
            <span className="text-muted truncate">{(e.prompt_hash ?? "—").slice(0, 8)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- CprGateBanner ----------------------------------------------------------

function CprGateBanner({ count, onConfirm }: { count: number; onConfirm: () => void }) {
  return (
    <div className="bg-yellow-100 border border-rule p-4 text-ink text-sm mb-6">
      <div className="font-semibold mb-2">
        CPR 31.22 — implied undertaking · action required
      </div>
      <p className="leading-relaxed mb-3">
        {count} chronology {count === 1 ? "entry traces" : "entries trace"} to documents obtained
        under disclosure. CPR 31.22(1) restricts use of disclosed material to the proceedings in
        which it was disclosed. Until you acknowledge the implied undertaking, the server
        withholds detail of those {count === 1 ? "entry" : "entries"} — the rows below show them
        as redacted.
      </p>
      <p className="text-prose leading-relaxed mb-4">
        Acknowledgement is recorded in the audit trail (action:{" "}
        <span className="font-mono text-xs text-ink">chronology.gate.confirmed</span>) and scoped
        to this matter and user.
      </p>
      <button
        onClick={onConfirm}
        className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px]"
      >
        I confirm
      </button>
    </div>
  );
}

// -- ToggleButton (P9 inline) -----------------------------------------------

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "font-mono uppercase text-[11px] tracking-track2 font-bold border-b-2 h-full pt-1 -mb-px transition-colors " +
        (active
          ? "text-ink border-ink"
          : "text-muted hover:text-ink border-transparent")
      }
    >
      {children}
    </button>
  );
}

// -- PrivilegeControl -------------------------------------------------------

function PrivilegeControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const colour =
    value === "A_cleared"
      ? "#00A35C"
      : value === "B_mixed"
        ? "#E67E22"
        : value === "C_paused"
          ? "#D9304F"
          : "#181818";
  return (
    <label
      className="relative inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold cursor-pointer"
      style={{ borderColor: colour, color: colour }}
    >
      <span className="w-1.5 h-1.5" style={{ backgroundColor: colour }} />
      {value.replace("_", " ").toUpperCase()}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Privilege posture"
      >
        <option value="A_cleared">A_cleared — frontier OK</option>
        <option value="B_mixed">B_mixed — local preferred</option>
        <option value="C_paused">C_paused — LLM blocked</option>
      </select>
    </label>
  );
}

// -- Helpers ----------------------------------------------------------------

function ErrorCallout({ message, compact = false }: { message: string; compact?: boolean }) {
  const { status, body } = parseError(message);
  return (
    <div className={`bg-red-50 border border-red-700 ${compact ? "p-3" : "p-4"} text-red-700 text-sm my-3`}>
      <div className="font-semibold mb-1">
        Error{status ? ` · HTTP ${status}` : ""}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function parseError(err: string): { status: string | null; body: string } {
  const m = err.match(/^Error:\s*(\d{3})\s+([^:]+):\s*(.*)$/s);
  if (!m) {
    return { status: null, body: err.replace(/^Error:\s*/, "") };
  }
  const [, status, , raw] = m;
  let body = raw.trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.detail === "string") body = parsed.detail;
  } catch {
    // not JSON
  }
  return { status, body };
}

function LoadingLine({ label }: { label: string }) {
  return (
    <p className="font-mono text-xs text-muted flex items-center gap-2">
      <InlineSpinner />
      {label}
    </p>
  );
}

function InlineSpinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="eyebrow-sm">
        {label}
        {hint && <span className="text-muted text-xs normal-case tracking-normal ml-2">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colour =
    status === "open"
      ? "#00A35C"
      : status === "closed" || status === "paused"
        ? "#D9304F"
        : "#181818";
  return (
    <span
      className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold"
      style={{ borderColor: colour, color: colour }}
    >
      <span className="w-1.5 h-1.5" style={{ backgroundColor: colour }} />
      {status.toUpperCase()}
    </span>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="border border-rule text-ink text-[10px] font-mono uppercase tracking-track2 px-2 py-0.5 inline-flex items-center gap-1.5">
      {children}
    </span>
  );
}

function Footer() {
  return (
    <footer className="mt-32 pt-12 border-t border-rule flex flex-wrap gap-y-4 justify-between items-center text-xs text-muted uppercase tracking-track2">
      <span>© 2026 Legalise — Apache 2.0</span>
      <div className="flex gap-6">
        <a
          href="https://github.com/b1rdmania/legalise/blob/master/docs/TRUST.md"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          Trust
        </a>
        <a
          href="https://github.com/b1rdmania/legalise"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}

// -- StubSurface — placeholder for routes whose pages land in Day C ----------

function StubSurface({
  eyebrow,
  heading,
  body,
}: {
  eyebrow: string;
  heading: string;
  body: string;
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <div className="eyebrow font-mono text-muted mb-4">{eyebrow}</div>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink mb-6 leading-[1.1]">
        {heading}
      </h1>
      <p className="prose-p">{body}</p>
      <a
        href="#/"
        className="inline-flex items-center text-sm text-muted hover:text-ink transition-colors mt-4"
      >
        Back to landing
      </a>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}
