import { useEffect, useState } from "react";
import { BACKEND_ROOT, type Matter } from "../lib/api";
import { navigate, useRoute, type Route } from "../lib/route";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { SignIn } from "../auth/SignIn";
import { SignUp } from "../auth/SignUp";
import { ForgotPassword } from "../auth/ForgotPassword";
import { ResetPassword } from "../auth/ResetPassword";
import { VerifyPending } from "../auth/VerifyPending";
import { Verify } from "../auth/Verify";
import { Settings } from "../auth/Settings";
import { Landing } from "../landing/Landing";
import { Modules } from "../modules-page/Modules";
import { MatterList } from "../matter/MatterList";
import { NewMatter } from "../matter/NewMatter";
import { MatterDetail } from "../matter/MatterDetail";
import { TopBar } from "../ui/TopBar";
import { Drawer } from "../ui/Drawer";
import type { TabKey } from "../matter/tabs/types";

// Seeded matter slug from backend/app/core/seed.py. Authenticated users land
// here directly; unauthenticated visitors are routed to signup first because
// /api/matters/{slug} and friends are auth-gated. Day D will copy Khan into
// each user's workspace on signup.
const DEMO_SLUG = "khan-v-acme-trading-2026";
// Authed CTA target lands in Day C once useAuth is wired (this constant is
// referenced by the future authed branch). Day D ships the post-signup Khan
// copy, at which point this becomes the matter under the user's own scope.
export const DEMO_HREF_AUTHED = `#/matters/${DEMO_SLUG}`;

type HealthResponse = { status: string; version: string; database: string; environment: string };

const PROTECTED_ROUTE_NAMES = new Set<Route["name"]>(["list", "new", "detail", "settings"]);

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const route = useRoute();
  const auth = useAuth();
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

  // Protected-route redirect: once auth has resolved and the user is null,
  // bounce protected routes to /auth/signin. Lets unauthed visitors browse
  // landing + modules + auth pages without flicker.
  useEffect(() => {
    if (auth.loading) return;
    if (auth.user) return;
    if (PROTECTED_ROUTE_NAMES.has(route.name)) navigate("/auth/signin");
  }, [auth.loading, auth.user, route.name]);

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
        {route.name === "signin" && <SignIn />}
        {route.name === "signup" && <SignUp />}
        {route.name === "forgot" && <ForgotPassword />}
        {route.name === "reset" && <ResetPassword token={route.token} />}
        {route.name === "verifyPending" && <VerifyPending />}
        {route.name === "verify" && <Verify token={route.token} />}
        {route.name === "settings" && <Settings tab={route.tab} />}
      </main>
    </div>
  );
}
