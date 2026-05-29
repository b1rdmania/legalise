/**
 * Phase 14 A — `/app` first-run + authed home.
 *
 * Three-state machine driven by GET /api/system/bootstrap-state
 * (Phase 13b C, no auth required) and the AuthProvider session:
 *
 *   1. user_count === 0
 *      Empty state. "No accounts yet. Register the first account."
 *      Primary CTA → /auth/register (a.k.a. /auth/signup).
 *      Does NOT claim registration grants admin — bootstrap is a
 *      separate step (Phase 12 CLI).
 *
 *   2. user_count > 0 && has_superuser === false
 *      "Bootstrap administrator required" — literal CLI command + the
 *      binary path. Deliberately no UI shortcut; bootstrap stays a
 *      host-side action per Phase 12 scope.
 *
 *   3. has_superuser === true
 *      If unauth → bounce to /auth/signin (or /waitlist when
 *      HOSTED_ACCESS_WAITLIST). If authed → render the home (recent
 *      matters + "Open Khan v Acme" CTA).
 *
 * Reviewer-narrow scope (Phase 14 A): no module catalog, no grants,
 * no reconstruction, no admin. The home renders matter list + Khan
 * CTA and stops.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  getBootstrapState,
  listAudit,
  listMatters,
  type AuditEntry,
  type BootstrapState,
  type Matter,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { HOSTED_ACCESS_WAITLIST } from "../lib/access";

const DEMO_SLUG = "khan-v-acme-trading-2026";
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
        Register the first account to begin. Administrator status is set
        separately by running the bootstrap CLI on the host; registration
        creates a normal user.
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
      <pre className="mt-6 overflow-x-auto rounded-md border border-line bg-paper-sunken px-4 py-3 text-sm font-mono">
        <code>{BOOTSTRAP_CLI}</code>
      </pre>
      <p className="mt-3 text-xs font-mono text-muted">{BOOTSTRAP_PATH}</p>
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
// State 3b — workspace is up, viewer is authenticated. Recent matters
// + Khan CTA. Reviewer-narrow: no modules / grants / reconstruction here.
// ---------------------------------------------------------------------------

function AuthedHome() {
  const [matters, setMatters] = useState<Matter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMatters()
      .then((rows) => {
        if (cancelled) return;
        setMatters(rows);
        // Recent activity: the most-recently-opened matter's audit
        // trail. Per-matter (no superuser needed) — a representative
        // feed for the dashboard. Workspace-wide activity is the
        // dedicated Audit surface.
        const primary = rows[0];
        if (primary) {
          listAudit(primary.slug, 6)
            .then((a) => !cancelled && setActivity(a))
            .catch(() => !cancelled && setActivity([]));
        } else {
          setActivity([]);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = (matters ?? []).slice(0, 4);
  const khanInList = (matters ?? []).some((m) => m.slug === DEMO_SLUG);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <p className="text-[11px] uppercase tracking-widest text-muted">Workspace</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight2">Dashboard</h1>

      {/* Guided demo: see the governed loop run end-to-end with no key. */}
      <Link
        to="/demo-loop"
        className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink bg-ink px-4 py-3 text-paper hover:opacity-90"
        data-testid="try-governed-loop"
      >
        <span>
          <span className="text-sm font-medium">Try the governed loop</span>
          <span className="mt-0.5 block text-xs opacity-80">
            Run a skill → artifact → review → audit trail. No provider key needed.
          </span>
        </span>
        <span aria-hidden="true" className="text-sm">→</span>
      </Link>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Recent matters */}
        <section>
          <h2 className="text-[11px] uppercase tracking-widest text-muted border-b border-rule pb-2">
            Recent matters
          </h2>
          {error && (
            <p className="mt-3 text-sm text-seal">Could not load matters: {error}</p>
          )}
          {matters === null && !error && (
            <p className="mt-3 text-sm text-muted">Loading…</p>
          )}
          {matters !== null && matters.length === 0 && (
            <p className="mt-3 text-sm text-muted">No matters yet.</p>
          )}
          {recent.length > 0 && (
            <ul className="mt-3 border border-rule divide-y divide-rule">
              {recent.map((m) => (
                <li key={m.id}>
                  <Link
                    to="/matters/$slug"
                    params={{ slug: m.slug }}
                    className="flex items-baseline justify-between gap-4 px-3 py-2.5 hover:bg-wash transition-colors"
                  >
                    <span className="text-sm font-medium text-ink truncate">{m.title}</span>
                    <span className="text-[11px] text-muted font-mono shrink-0">{m.slug}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm">
            <Link to="/matters" className="text-muted hover:text-ink underline underline-offset-4">
              All matters
            </Link>
            <Link to="/matters/new" className="text-muted hover:text-ink underline underline-offset-4">
              New matter
            </Link>
            {!khanInList && (
              <Link
                to="/matters/$slug"
                params={{ slug: DEMO_SLUG }}
                className="text-muted hover:text-ink underline underline-offset-4"
              >
                Open Khan v Acme
              </Link>
            )}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <h2 className="text-[11px] uppercase tracking-widest text-muted border-b border-rule pb-2">
            Recent activity
          </h2>
          {activity === null && (
            <p className="mt-3 text-sm text-muted">Loading…</p>
          )}
          {activity !== null && activity.length === 0 && (
            <p className="mt-3 text-sm text-muted">No activity yet.</p>
          )}
          {activity && activity.length > 0 && (
            <ul className="mt-3 border border-rule divide-y divide-rule">
              {activity.map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <div className="font-mono text-[11px] text-ink truncate">{a.action}</div>
                  <div className="text-[10px] text-muted">{a.timestamp.slice(0, 16).replace("T", " ")}</div>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/admin/audit"
            className="mt-3 inline-block text-sm text-muted hover:text-ink underline underline-offset-4"
          >
            Full audit
          </Link>
        </section>
      </div>
    </div>
  );
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
