import { navigate, type Route } from "../lib/route";
import type { Matter } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "./BrandMark";
import { ProfileChip } from "./ProfileChip";
import { SIDEBAR_NAV, WORKFLOW_TABS, type TabKey } from "../matter/tabs/types";

const DEMO_HREF_UNAUTHED = "#/demo";

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

  const surfaceLabel =
    SIDEBAR_NAV.find((t) => t.key === drawerTab)?.label ??
    WORKFLOW_TABS.find((t) => t.key === drawerTab)?.label ??
    "";

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
          <a href="#/" className="flex items-center gap-3 group outline-none">
            <BrandMark />
            <span className="font-bold text-lg tracking-tight2 text-ink mt-0.5">LEGALISE</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink">
            {auth.user ? (
              <>
                <a
                  href="#/matters"
                  className={
                    "transition-colors " + (isList ? "text-ink font-semibold" : "text-ink hover:text-muted")
                  }
                >
                  Matters
                </a>
                <a
                  href="#/modules"
                  className={
                    "transition-colors " + (isModules ? "text-ink font-semibold" : "text-ink hover:text-muted")
                  }
                >
                  Modules
                </a>
                <a
                  href="#/settings/profile"
                  className={
                    "transition-colors " + (route.name === "settings" ? "text-ink font-semibold" : "text-ink hover:text-muted")
                  }
                >
                  Settings
                </a>
                <ProfileChip user={auth.user} onSignOut={() => void auth.signOut().then(() => navigate("/"))} />
              </>
            ) : (
              <>
                <a
                  href={DEMO_HREF_UNAUTHED}
                  className="text-ink hover:text-muted transition-colors"
                >
                  Open the demo
                </a>
                <a
                  href="#/auth/signup"
                  className="text-ink hover:text-muted transition-colors"
                >
                  Sign up free
                </a>
                <a
                  href="#/auth/signin"
                  className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors"
                >
                  Sign in
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
