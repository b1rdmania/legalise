/**
 * `/app` bootstrap-aware entry point.
 *
 * Three-state machine driven by GET /api/system/bootstrap-state
 * (no auth required) and the AuthProvider session:
 *
 *   1. user_count === 0
 *      Empty state. "No accounts yet. Register the first account."
 *      Primary CTA → /auth/register (a.k.a. /auth/signup). Local
 *      quickstart promotes that first user automatically; deployments
 *      that disable the dev convenience fall through to state 2 after
 *      signup.
 *
 *   2. user_count > 0 && has_superuser === false
 *      "Bootstrap administrator required" — literal CLI command + the
 *      binary path. Deliberately no UI shortcut.
 *
 *   3. has_superuser === true
 *      If unauth → bounce to /auth/signin (or /waitlist when
 *      HOSTED_ACCESS_WAITLIST). If authed → bounce to /matters, the
 *      canonical workspace index.
 *
 * The /app route exists ONLY to host bootstrap states 1 and 2. Once
 * the workspace is operational, /matters owns the authed home.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { getBootstrapState, type BootstrapState } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { HOSTED_ACCESS_WAITLIST } from "../lib/access";

const BOOTSTRAP_CLI = "python -m app.tools.bootstrap_admin <email>";
const BOOTSTRAP_PATH = "backend/app/tools/bootstrap_admin.py";

type BootstrapQuery =
  | { status: "loading" }
  | { status: "ready"; data: BootstrapState }
  | { status: "error"; message: string };

function useBootstrapState(): BootstrapQuery {
  const [q, setQ] = useState<BootstrapQuery>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    getBootstrapState()
      .then((data) => {
        if (!cancelled) setQ({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setQ({ status: "error", message: String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return q;
}

export function AppHome() {
  const auth = useAuth();
  const boot = useBootstrapState();

  if (boot.status === "loading") return <CenteredLoader label="Checking workspace state…" />;
  if (boot.status === "error") return <CenteredError message={boot.message} />;

  const { user_count, has_superuser } = boot.data;

  // State 1: fresh fork.
  if (user_count === 0) return <FirstRunEmptyState />;

  // State 2: users exist but nobody has been promoted to superuser.
  // The current viewer is either anonymous or one of the regular users
  // who registered before bootstrap completed. Either way the message
  // is the same — the workspace needs a host-side CLI run.
  if (!has_superuser) return <BootstrapRequiredState />;

  // State 3: workspace is up. Unauth → bounce to signin. Authed → home.
  if (auth.loading) return <CenteredLoader label="Resolving session…" />;
  if (!auth.user) {
    return <SigninRedirect />;
  }
  return <AuthedHome />;
}

// ---------------------------------------------------------------------------
// State 1 — fresh fork. No claim of admin status.
// ---------------------------------------------------------------------------

function FirstRunEmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">
        Fresh workspace
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight2">No accounts yet</h1>
      <p className="mt-4 text-muted">
        Register the first account to begin. In the local quickstart,
        that account is verified, seeded with Khan v Acme, and promoted
        to workspace admin automatically. Deployments that disable
        auto-admin will show the host-side bootstrap command after
        signup.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Link
          to="/auth/signup"
          className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-paper hover:opacity-90"
        >
          Register first account
        </Link>
        <a
          href="https://github.com/b1rdmania/legalise#readme"
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-muted hover:text-ink underline underline-offset-4"
        >
          Read the open-core README
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State 2 — users exist, no superuser. Surface the CLI literal.
// ---------------------------------------------------------------------------

function BootstrapRequiredState() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">
        Bootstrap required
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight2">
        Administrator not yet bootstrapped
      </h1>
      <p className="mt-4 text-muted">
        Accounts exist in this workspace but no administrator has been
        designated yet. Run the bootstrap command on the host to promote
        an existing user. This step is deliberately host-side; the UI does
        not expose a self-promotion path.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-md border border-line bg-paper-sunken px-4 py-3 text-sm tech-token">
        <code>{BOOTSTRAP_CLI}</code>
      </pre>
      <p className="mt-3 text-xs tech-token text-muted">{BOOTSTRAP_PATH}</p>
      <p className="mt-6 text-sm text-muted">
        Once the bootstrap CLI completes successfully, refresh this page.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State 3a — workspace is up, viewer is unauthenticated.
// ---------------------------------------------------------------------------

function SigninRedirect() {
  const nav = useNavigate();
  useEffect(() => {
    void nav({ to: HOSTED_ACCESS_WAITLIST ? "/waitlist" : "/auth/signin" });
  }, [nav]);
  return <CenteredLoader label="Redirecting…" />;
}

// ---------------------------------------------------------------------------
// State 3b — workspace is up, viewer is authenticated. The dedicated
// authed-home dashboard was retired with the IA reset: /matters is now
// the canonical workspace index, and we bounce there instead of
// re-rendering recent-matters + activity widgets on /app. AppHome stays
// mounted only to handle bootstrap states 1 and 2.
// ---------------------------------------------------------------------------

function AuthedHome() {
  const nav = useNavigate();
  useEffect(() => {
    void nav({ to: "/matters", replace: true });
  }, [nav]);
  return <CenteredLoader label="Opening workspace…" />;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function CenteredLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted text-sm">
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full border-2 border-muted border-t-transparent animate-spin"
          aria-hidden="true"
        />
        {label}
      </span>
    </div>
  );
}

function CenteredError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <h1 className="text-2xl font-bold tracking-tight2">Could not load workspace state</h1>
      <p className="mt-4 text-sm text-muted">{message}</p>
      <p className="mt-4 text-sm text-muted">
        Refreshing may help. If the issue persists, check the backend is
        reachable and the bootstrap-state endpoint responds.
      </p>
    </div>
  );
}
