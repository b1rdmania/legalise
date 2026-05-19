import { navigate, type Route } from "../lib/route";
import type { Matter } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { TABS } from "../matter/tabs/types";

const DEMO_HREF_UNAUTHED = "#/demo";
const GITHUB_REPO = "https://github.com/b1rdmania/legalise";
const GITHUB_DOCS = "https://github.com/b1rdmania/legalise/tree/master/docs";

type HealthResponse = { status: string; version: string; database: string; environment: string };

export function Drawer({
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
  const auth = useAuth();
  if (!navOpen) return null;

  const isDetail = route.name === "detail";
  const isModules = route.name === "modules";
  const isList = route.name === "list" || route.name === "new";
  const isSettings = route.name === "settings";
  const close = () => setNavOpen(false);

  const onSignOut = async () => {
    await auth.signOut();
    setNavOpen(false);
    navigate("/");
  };

  // P18 drawer item sets - match docs/DESIGN.md §P18 §"Drawer items by state".
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
    // Workspace + matter in scope: tabs · - · Modules · Settings · Sign out
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
    // Workspace no matter: Matters · Modules · - · Settings · Sign out
    primary = [
      { href: "#/matters", label: "Matters", active: isList },
      { href: "#/modules", label: "Modules", active: isModules },
    ];
    secondary = [
      { href: "#/settings/profile", label: "Settings", active: isSettings },
      { label: "Sign out", onClick: onSignOut },
    ];
  } else if (auth.user) {
    // Authed marketing/landing view: keep the authed workspace nav so the
    // user never sees marketing CTAs once signed in.
    primary = [
      { href: "#/matters", label: "Matters" },
      { href: "#/modules", label: "Modules" },
    ];
    secondary = [
      { href: "#/settings/profile", label: "Settings" },
      { label: "Sign out", onClick: onSignOut },
    ];
  } else {
    // Unauth marketing: Modules · Docs · GitHub · - · Open the demo · Sign up free · Sign in
    primary = [
      { href: "#/modules", label: "Modules" },
      { href: GITHUB_DOCS, label: "Docs", external: true },
      { href: GITHUB_REPO, label: "GitHub", external: true },
    ];
    secondary = [
      { href: DEMO_HREF_UNAUTHED, label: "Open the demo" },
      { href: "#/auth/signup", label: "Sign up free" },
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
