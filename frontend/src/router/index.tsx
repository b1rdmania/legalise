/**
 * TanStack Router — full route tree.
 *
 * All routes are path-based; legacy hash URLs are caught at boot in
 * main.tsx and rewritten in-place via history.replaceState (see
 * `redirectLegacyHash`).
 *
 * Routes are code-based (not the vite-plugin codegen flow). The whole
 * tree lives in this file so it is reviewable in a single read;
 * splitting per file is a future mechanical refactor with no
 * behavioural delta.
 */

import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import { AppShell } from "../app/AppShell";
import { AppHome } from "../app/AppHome";
import { AuthGate } from "../app/AuthGate";
import { ModulesCatalog } from "../modules-v2/ModulesCatalog";
import { ModuleDetail } from "../modules-v2/ModuleDetail";
import { CreateModule } from "../modules-v2/CreateModule";
import { LawveImport } from "../modules-v2/LawveImport";
import { DemoLoop } from "../demo/DemoLoop";
import { InstallCeremony } from "../modules-v2/InstallCeremony";
import { ArtifactsList } from "../matter/ArtifactsList";
import { ArtifactDetail } from "../matter/ArtifactDetail";
import { SignOff } from "../matter/SignOff";
import { SignOffConfirmation } from "../matter/SignOffConfirmation";
import { ReconstructionView } from "../matter/ReconstructionView";
import { DocumentDetail } from "../matter/DocumentDetail";
import { MatterLifecycle } from "../matter/MatterLifecycle";
import { AdminUsersList } from "../admin/AdminUsersList";
import { AdminUserDetail } from "../admin/AdminUserDetail";
import { AdminAuditView } from "../admin/AdminAuditView";
import { Landing } from "../landing/Landing";
import { Manifesto } from "../landing/Manifesto";
import { Waitlist } from "../landing/Waitlist";
import { SubmitModule } from "../landing/SubmitModule";
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

// /skills is the v2 catalog (ModulesCatalog). The earlier Modules
// component (v1 skill enable/disable) is retained in the codebase
// under src/modules-page/ for reference but no longer mounted on a
// route. Importing it elsewhere still works.
//
// The legacy /modules path is preserved via `legacyModulesRedirect`
// below as a router-level redirect shim (TanStack `beforeLoad`), so
// deep links, bookmarks, and tests keep working.
const modulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/skills",
  component: ModulesCatalog,
});

const legacyModulesRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules",
  beforeLoad: () => {
    throw redirect({ to: "/skills" });
  },
  component: () => null,
});

const submitModuleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/skills/submit",
  component: SubmitModule,
});

const legacySubmitModuleRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules/submit",
  beforeLoad: () => {
    throw redirect({ to: "/skills/submit" });
  },
  component: () => null,
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
    // Fast-path redirect when we *already know* the user is logged
    // out at navigation time. The real gate is the AuthGate component
    // below — it owns the loading state and the post-bootstrap redirect.
    // beforeLoad cannot observe React state changes, so it never blocks
    // the first render on auth bootstrap; AuthGate does.
    const snap = getAuthSnapshot();
    if (!snap.loading && !snap.user) {
      throw redirect({
        to: HOSTED_ACCESS_WAITLIST ? "/waitlist" : "/auth/signin",
      });
    }
  },
  component: AuthGate,
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
// App sub-routes.
//
// Settings polish reuses the existing /settings routes rather than
// adding new ones, so no placeholder remains here.
//
// All routes inherit the authed gate via __authed except `/app`,
// which is intentionally public — see appHomeRoute below.
// ---------------------------------------------------------------------------

// `/app` is intentionally NOT under __authed. The first-run states
// (user_count=0, bootstrap-required) must be reachable without a
// session; AppHome handles its own auth gating when the workspace
// is past bootstrap.
const appHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: AppHome,
});

// Authed operator/developer create-skill on-ramp. Registered before
// /skills/$moduleId so the literal "create" segment wins.
const createModuleRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/skills/create",
  component: CreateModule,
});

const legacyCreateModuleRedirect = createRoute({
  getParentRoute: () => authedRoute,
  path: "/modules/create",
  beforeLoad: () => {
    throw redirect({ to: "/skills/create" });
  },
  component: () => null,
});

const lawveImportRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/skills/lawve",
  component: LawveImport,
});

const legacyLawveImportRedirect = createRoute({
  getParentRoute: () => authedRoute,
  path: "/modules/lawve",
  beforeLoad: () => {
    throw redirect({ to: "/skills/lawve" });
  },
  component: () => null,
});

const demoLoopRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/demo-loop",
  component: DemoLoop,
});

const moduleDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/skills/$moduleId",
  component: () => {
    const { moduleId } = moduleDetailRoute.useParams();
    return <ModuleDetail moduleId={moduleId} />;
  },
});

const legacyModuleDetailRedirect = createRoute({
  getParentRoute: () => authedRoute,
  path: "/modules/$moduleId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/skills/$moduleId",
      params: { moduleId: (params as { moduleId: string }).moduleId },
    });
  },
  component: () => null,
});

const moduleInstallRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/skills/install/$ceremonyId",
  component: () => {
    const { ceremonyId } = moduleInstallRoute.useParams();
    return <InstallCeremony ceremonyId={ceremonyId} />;
  },
});

const legacyModuleInstallRedirect = createRoute({
  getParentRoute: () => authedRoute,
  path: "/modules/install/$ceremonyId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/skills/install/$ceremonyId",
      params: { ceremonyId: (params as { ceremonyId: string }).ceremonyId },
    });
  },
  component: () => null,
});

// Reconstruction. Query-param contract: ?invocation_id=… (deep
// links from invocations), ?action=… (deep links from ceremonies
// and grants).
type MatterAuditSearch = { invocation_id?: string; action?: string };
export const matterAuditRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/audit",
  validateSearch: (s: Record<string, unknown>): MatterAuditSearch => ({
    invocation_id:
      typeof s.invocation_id === "string" ? s.invocation_id : undefined,
    action: typeof s.action === "string" ? s.action : undefined,
  }),
  component: () => {
    const { slug } = matterAuditRoute.useParams();
    return <ReconstructionView slug={slug} />;
  },
});

const matterArtifactsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/artifacts",
  component: () => {
    const { slug } = matterArtifactsRoute.useParams();
    return <ArtifactsList slug={slug} />;
  },
});

const matterArtifactDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/artifacts/$artifactId",
  component: () => {
    const { slug, artifactId } = matterArtifactDetailRoute.useParams();
    return <ArtifactDetail slug={slug} artifactId={artifactId} />;
  },
});

const matterArtifactSignRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/artifacts/$artifactId/sign",
  component: () => {
    const { slug, artifactId } = matterArtifactSignRoute.useParams();
    return <SignOff slug={slug} artifactId={artifactId} />;
  },
});

const matterSignoffRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/signoffs/$signoffId",
  component: () => {
    const { slug, signoffId } = matterSignoffRoute.useParams();
    return <SignOffConfirmation slug={slug} signoffId={signoffId} />;
  },
});

// ?from=<tab> tells DocumentDetail which matter surface to send the
// user back to. Optional; falls back to Documents when absent.
type MatterDocumentDetailSearch = { from?: string };
const matterDocumentDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/documents/$documentId",
  validateSearch: (s: Record<string, unknown>): MatterDocumentDetailSearch => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  component: () => {
    const { slug, documentId } = matterDocumentDetailRoute.useParams();
    return <DocumentDetail slug={slug} documentId={documentId} />;
  },
});

const matterLifecycleRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/matters/$slug/lifecycle",
  component: () => {
    const { slug } = matterLifecycleRoute.useParams();
    return <MatterLifecycle slug={slug} />;
  },
});

const adminUsersRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/admin/users",
  component: AdminUsersList,
});

const adminUserDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/admin/users/$userId",
  component: () => {
    const { userId } = adminUserDetailRoute.useParams();
    return <AdminUserDetail userId={userId} />;
  },
});

// Workspace / admin audit reconstruction. Mirrors the query-param
// contract from matterAuditRoute: ?invocation_id=… + ?action=… both
// honoured. Substrate gates on superuser; AdminAuditView mirrors
// the AdminUsersList belt-and-braces UI gate.
type AdminAuditSearch = { invocation_id?: string; action?: string };
export const adminAuditRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/admin/audit",
  validateSearch: (s: Record<string, unknown>): AdminAuditSearch => ({
    invocation_id:
      typeof s.invocation_id === "string" ? s.invocation_id : undefined,
    action: typeof s.action === "string" ? s.action : undefined,
  }),
  component: AdminAuditView,
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
  legacyModulesRedirect,
  submitModuleRoute,
  legacySubmitModuleRedirect,
  demoIndexRoute,
  demoTabRoute,
  appHomeRoute,
  authedRoute.addChildren([
    mattersListRoute,
    newMatterRoute,
    matterDetailRoute,
    matterDetailTabRoute,
    settingsIndexRoute,
    settingsProfileRoute,
    settingsKeysRoute,
    settingsPreferencesRoute,
    createModuleRoute,
    legacyCreateModuleRedirect,
    lawveImportRoute,
    legacyLawveImportRedirect,
    demoLoopRoute,
    moduleDetailRoute,
    legacyModuleDetailRedirect,
    moduleInstallRoute,
    legacyModuleInstallRedirect,
    matterAuditRoute,
    matterArtifactsRoute,
    matterArtifactDetailRoute,
    matterArtifactSignRoute,
    matterSignoffRoute,
    matterDocumentDetailRoute,
    matterLifecycleRoute,
    adminUsersRoute,
    adminUserDetailRoute,
    adminAuditRoute,
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
