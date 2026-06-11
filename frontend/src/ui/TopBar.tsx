import { navigate, type Route } from "../lib/route";
import type { Matter } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { ProfileChip } from "./ProfileChip";
import { MATTER_TAB_LABELS, type TabKey } from "../matter/tabs/types";

const DEMO_HREF_UNAUTHED = "/demo";

export function TopBar({
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
  const auth = useAuth();
  const isDetail = route.name === "detail";
  const isModules = route.name === "modules";
  const isList = route.name === "list";
  const isDemo = route.name === "demo";
  // Admin nav anchor. Only superusers see it; the substrate
  // enforces independently. Active state covers the admin user
  // surfaces.
  const isAdmin =
    route.name === "adminUsers" || route.name === "adminUserDetail";
  const showAdminAnchor = auth.user?.is_superuser === true;

  const surfaceLabel = MATTER_TAB_LABELS[drawerTab] ?? "";

  return (
    <>
      {/* Dense-data variant - mobile, on matter detail */}
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
          <a href="/" className="flex items-center group outline-none" aria-label="Legalise">
            <img
              src="/legalise-wordmark.svg"
              alt="Legalise"
              className="h-[18px] sm:h-[22px] w-auto"
            />
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink">
            {auth.user ? (
              <>
                <a
                  href="/matters"
                  className={
                    "transition-colors " + (isList ? "text-ink font-semibold" : "text-ink hover:opacity-70")
                  }
                >
                  Matters
                </a>
                <a
                  href="/skills"
                  className={
                    "transition-colors " + (isModules ? "text-ink font-semibold" : "text-ink hover:opacity-70")
                  }
                >
                  Skills
                </a>
                <a
                  href="/settings/profile"
                  className={
                    "transition-colors " + (route.name === "settings" ? "text-ink font-semibold" : "text-ink hover:opacity-70")
                  }
                >
                  Settings
                </a>
                {showAdminAnchor && (
                  <a
                    href="/admin/users"
                    data-testid="admin-nav-anchor"
                    className={
                      "transition-colors " +
                      (isAdmin ? "text-ink font-semibold" : "text-ink hover:opacity-70")
                    }
                  >
                    Admin
                  </a>
                )}
                <ProfileChip
                  user={auth.user}
                  onSignOut={() => {
                    // "/" first, then signOut — the AppShell auth guard
                    // otherwise races this navigate and lands on signin.
                    navigate("/");
                    void auth.signOut();
                  }}
                />
              </>
            ) : (
              <>
                <a
                  href={DEMO_HREF_UNAUTHED}
                  className={
                    "transition-colors " +
                    (isDemo ? "text-ink font-semibold" : "text-ink hover:opacity-70")
                  }
                >
                  Demo
                </a>
                <a
                  href="/skills"
                  className={
                    "transition-colors " +
                    (isModules ? "text-ink font-semibold" : "text-ink hover:opacity-70")
                  }
                >
                  Skills
                </a>
                <a
                  href="https://github.com/b1rdmania/legalise"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink hover:opacity-70 transition-colors"
                >
                  GitHub
                </a>
              </>
            )}
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
