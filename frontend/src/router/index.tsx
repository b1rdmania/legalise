/**
 * TanStack Router — Phase 14 A0.
 *
 * Migrated from a hash-based switch in App.tsx. All routes are now
 * path-based; legacy hash URLs are caught at boot in main.tsx and
 * rewritten in-place via history.replaceState (see `redirectLegacyHash`).
 *
 * Routes are code-based (not the vite-plugin codegen flow). One file per
 * route would be cleaner — for A0 we keep them inline so the whole tree
 * is reviewable in a single read. Splitting per file is a future
 * mechanical refactor with no behavioural delta.
 */

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { AppShell } from "../app/AppShell";
import { Landing } from "../landing/Landing";
import { Manifesto } from "../landing/Manifesto";
import { Waitlist } from "../landing/Waitlist";
import { SubmitModule } from "../landing/SubmitModule";
import { Modules } from "../modules-page/Modules";
import { SignIn } from "../auth/SignIn";
import { SignUp } from "../auth/SignUp";
import { ForgotPassword } from "../auth/ForgotPassword";
import { ResetPassword } from "../auth/ResetPassword";
import { VerifyPending } from "../auth/VerifyPending";
import { Verify } from "../auth/Verify";
import { Settings } from "../auth/Settings";
import { MatterList } from "../matter/MatterList";
import { NewMatter } from "../matter/NewMatter";
import { MatterDetail } from "../matter/MatterDetail";
import { DemoMatter } from "../demo/DemoMatter";
import { HOSTED_ACCESS_WAITLIST } from "../lib/access";
import { getAuthSnapshot } from "../auth/AuthSnapshot";
import { PlaceholderPage } from "./PlaceholderPage";

// ---------------------------------------------------------------------------
// Root: AppShell renders TopBar / Drawer / <Outlet />.
// ---------------------------------------------------------------------------

const rootRoute = createRootRoute({
  component: AppShell,
});

// ---------------------------------------------------------------------------
// Public routes — accessible without a session.
// ---------------------------------------------------------------------------

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Landing,
});

const manifestoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/manifesto",
  component: Manifesto,
});

const waitlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/waitlist",
  component: Waitlist,
});

const signinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/signin",
  component: () => (HOSTED_ACCESS_WAITLIST ? <Waitlist /> : <SignIn />),
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/signup",
  component: () => (HOSTED_ACCESS_WAITLIST ? <Waitlist /> : <SignUp />),
});

const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/forgot",
  component: ForgotPassword,
});

type ResetSearch = { token?: string };
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/reset",
  component: () => {
    const { token } = resetRoute.useSearch();
    return <ResetPassword token={token ?? null} />;
  },
  validateSearch: (s: Record<string, unknown>): ResetSearch => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
});

const verifyPendingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/verify-pending",
  component: VerifyPending,
});

type VerifySearch = { token?: string };
const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/verify",
  component: () => {
    const { token } = verifyRoute.useSearch();
    return <Verify token={token ?? null} />;
  },
  validateSearch: (s: Record<string, unknown>): VerifySearch => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
});

const modulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules",
  component: Modules,
});

const submitModuleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules/submit",
  component: SubmitModule,
});

const demoIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/demo",
  component: DemoMatter,
});

const demoTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/demo/$tab",
  component: DemoMatter,
});

// ---------------------------------------------------------------------------
// Authed group — every route under this layout requires a session.
// `beforeLoad` reads the auth snapshot (populated by AuthProvider on mount)
// and redirects to /auth/signin (or /waitlist if HOSTED_ACCESS_WAITLIST).
// ---------------------------------------------------------------------------

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "__authed",
  beforeLoad: () => {
    const snap = getAuthSnapshot();
    // While auth is still loading we let the route render and let the
    // page-level spinner take over. Once loading is false and there's
    // no user, redirect.
    if (!snap.loading && !snap.user) {
      throw redirect({
        to: HOSTED_ACCESS_WAITLIST ? "/waitlist" : "/auth/signin",
      });
    }
  },
  component: () => <Outlet />,
});

const mattersListRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters",
  component: MatterList,
});

const newMatterRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/new",
  component: NewMatter,
});

const matterDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug",
  component: () => {
    const { slug } = matterDetailRoute.useParams();
    return <MatterDetail slug={slug} />;
  },
});

const matterDetailTabRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/$tab",
  component: () => {
    const { slug } = matterDetailTabRoute.useParams();
    return <MatterDetail slug={slug} />;
  },
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/settings",
  component: () => <Settings tab="profile" />,
});

const settingsProfileRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/settings/profile",
  component: () => <Settings tab="profile" />,
});

const settingsKeysRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/settings/keys",
  component: () => <Settings tab="keys" />,
});

const settingsPreferencesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/settings/preferences",
  component: () => <Settings tab="preferences" />,
});

// ---------------------------------------------------------------------------
// Phase 14 A-G placeholders — every new surface gets a route now so
// deep-links resolve. Each renders a "Coming in Phase 14 X" placeholder
// gated by VITE_FEATURE_FLAGS. Until its sub-step lands the route is
// reachable but inert.
//
// All placeholders inherit the authed gate via __authed.
// ---------------------------------------------------------------------------

const appHomeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/app",
  component: () => <PlaceholderPage phase="A" route="/app" title="App home" />,
});

const moduleDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/modules/$moduleId",
  component: () => (
    <PlaceholderPage phase="B" route="/modules/{moduleId}" title="Module detail" />
  ),
});

const moduleInstallRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/modules/install/$ceremonyId",
  component: () => (
    <PlaceholderPage
      phase="B"
      route="/modules/install/{ceremonyId}"
      title="Trust ceremony"
    />
  ),
});

const matterAuditRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/audit",
  component: () => (
    <PlaceholderPage
      phase="E"
      route="/matters/{slug}/audit"
      title="Reconstruction"
    />
  ),
});

const matterArtifactsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/artifacts",
  component: () => (
    <PlaceholderPage
      phase="D"
      route="/matters/{slug}/artifacts"
      title="Artifacts"
    />
  ),
});

const matterArtifactDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/artifacts/$artifactId",
  component: () => (
    <PlaceholderPage
      phase="D"
      route="/matters/{slug}/artifacts/{artifactId}"
      title="Artifact detail"
    />
  ),
});

const adminUsersRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/admin/users",
  component: () => (
    <PlaceholderPage phase="F" route="/admin/users" title="Admin · users" />
  ),
});

const adminUserDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/admin/users/$userId",
  component: () => (
    <PlaceholderPage
      phase="F"
      route="/admin/users/{userId}"
      title="Admin · user detail"
    />
  ),
});

// ---------------------------------------------------------------------------
// Route tree + router
// ---------------------------------------------------------------------------

const routeTree = rootRoute.addChildren([
  landingRoute,
  manifestoRoute,
  waitlistRoute,
  signinRoute,
  signupRoute,
  forgotRoute,
  resetRoute,
  verifyPendingRoute,
  verifyRoute,
  modulesRoute,
  submitModuleRoute,
  demoIndexRoute,
  demoTabRoute,
  authedRoute.addChildren([
    mattersListRoute,
    newMatterRoute,
    matterDetailRoute,
    matterDetailTabRoute,
    settingsIndexRoute,
    settingsProfileRoute,
    settingsKeysRoute,
    settingsPreferencesRoute,
    appHomeRoute,
    moduleDetailRoute,
    moduleInstallRoute,
    matterAuditRoute,
    matterArtifactsRoute,
    matterArtifactDetailRoute,
    adminUsersRoute,
    adminUserDetailRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const __routeIdsForTests = {
  landing: landingRoute.id,
  matters: mattersListRoute.id,
  matterDetail: matterDetailRoute.id,
  appHome: appHomeRoute.id,
  adminUsers: adminUsersRoute.id,
};
