/**
 * /admin/users/{userId}.
 *
 * Shows the substrate's UserAdminRead fields + a role-mutation form.
 *
 * Substrate truth (backend/app/api/admin_users.py):
 *   - POST /api/admin/users/{id}/role takes {role} ONLY. The audit
 *     reason is server-hardcoded to "manual_admin_action"
 *     (admin_users.py:182). Operator-supplied reasons would be a
 *     backend extension; UI does not collect.
 *   - Self-promotion is forbidden (admin_users.py:152).
 *   - Same-role POST is idempotent (200, no audit row).
 *   - Allowed values come from ALLOWED_ROLES (admin_users.py:52).
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AdminRequiredError,
  ALLOWED_ROLES,
  changeUserRole,
  getAdminUser,
  InvalidRoleError,
  SelfPromotionForbiddenError,
  type UserAdminRead,
  type UserRole,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../ui/primitives";
import { CertCard, CertEyebrow, LedgerRow, SectionRule } from "../ui/certificate";

type Query =
  | { status: "loading" }
  | { status: "ready"; user: UserAdminRead }
  | { status: "admin_required" }
  | { status: "not_found" }
  | { status: "error"; message: string };

type Mutation =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; newRole: string }
  | { kind: "self_promotion_forbidden"; message: string }
  | { kind: "invalid_role"; supplied: string; allowed: string[] }
  | { kind: "error"; message: string };

// No "noop" mutation kind. The role-change endpoint returns
// {id,email,role,is_superuser} with no `changed` flag, so the UI
// cannot reliably distinguish a fresh write from an idempotent
// no-op via the response. Same-role submit is disabled by the
// form, and the substrate's idempotent contract is mentioned in
// the explainer copy. If the backend adds `changed:bool` later
// the UI can branch honestly; until then, claiming no-op from a
// role-comparison inference would race against stale-data scenarios.

export function AdminUserDetail({ userId }: { userId: string }) {
  const auth = useAuth();
  const [q, setQ] = useState<Query>({ status: "loading" });
  const [m, setM] = useState<Mutation>({ kind: "idle" });
  const [draftRole, setDraftRole] = useState<UserRole | "">("");

  useEffect(() => {
    // Gate the fetch on auth BEFORE scheduling. Calling the admin
    // endpoint from a non-admin viewer is the smuggled-authority
    // pattern ACCEPTANCE §12 forbids — substrate would 403, but
    // the call never gets to fire under this gate.
    if (auth.loading) return;
    if (!auth.user || !auth.user.is_superuser) {
      setQ({ status: "admin_required" });
      return;
    }
    let cancelled = false;
    setQ({ status: "loading" });
    getAdminUser(userId)
      .then((user) => {
        if (cancelled) return;
        setQ({ status: "ready", user });
        setDraftRole(
          (ALLOWED_ROLES as readonly string[]).includes(user.role)
            ? (user.role as UserRole)
            : "",
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AdminRequiredError) {
          setQ({ status: "admin_required" });
          return;
        }
        const msg = String(err);
        if (/404/.test(msg) || /user_not_found/.test(msg)) {
          setQ({ status: "not_found" });
          return;
        }
        setQ({ status: "error", message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.user, userId]);

  if (!auth.loading && auth.user && !auth.user.is_superuser) {
    return <AdminRequiredShell />;
  }
  if (q.status === "loading") {
    return (
      <div className="page-shell text-sm text-muted">
        Loading user…
      </div>
    );
  }
  if (q.status === "admin_required") return <AdminRequiredShell />;
  if (q.status === "not_found") {
    return (
      <div className="page-shell">
        <h1 className="text-xl font-bold tracking-tight2">User not found</h1>
        <p className="mt-3 text-sm">
          <Link
            to="/admin/users"
            className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            ← All users
          </Link>
        </p>
      </div>
    );
  }
  if (q.status === "error") {
    return (
      <div className="page-shell">
        <h1 className="text-xl font-bold tracking-tight2">Could not load user</h1>
        <p className="mt-3 text-sm text-muted">{q.message}</p>
      </div>
    );
  }

  const user = q.user;
  const isSelf = auth.user?.id === user.id;
  const roleUnchanged = draftRole === user.role;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftRole) return;
    setM({ kind: "submitting" });
    try {
      const updated = await changeUserRole(userId, draftRole);
      // No noop branch here. The role-change response carries no
      // `changed` flag, so we can't honestly distinguish a fresh
      // write from an idempotent no-op via the response alone. The
      // submit button is disabled when draftRole === user.role, so
      // the no-op path isn't normally reachable from this UI; any
      // 200 we receive is treated as "substrate accepted the
      // request" and reported as such.
      setM({ kind: "ok", newRole: updated.role });
      setQ({ status: "ready", user: { ...user, role: updated.role } });
    } catch (err) {
      if (err instanceof SelfPromotionForbiddenError) {
        setM({ kind: "self_promotion_forbidden", message: err.message });
        return;
      }
      if (err instanceof InvalidRoleError) {
        setM({
          kind: "invalid_role",
          supplied: err.supplied,
          allowed: err.allowed,
        });
        return;
      }
      setM({ kind: "error", message: String(err) });
    }
  };

  return (
    <div className="page-shell">
      <PageHeader title={user.email} subId={user.id} />

      <CertCard testid="practitioner-card">
        <CertEyebrow
          left="Practitioner"
          right={user.is_superuser ? "Superuser" : undefined}
          rightTone="ink"
        />
        <h2 className="mt-3 text-[22px] leading-tight tracking-tight2 text-ink">
          {user.email}
        </h2>
        {user.name && <p className="mt-1 text-xs text-muted">{user.name}</p>}
        <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[11px] text-muted">
          <LedgerRow label="Role">
            <code className="tech-token">{user.role}</code>
          </LedgerRow>
          <LedgerRow label="Superuser">
            {user.is_superuser ? "yes" : "no"}
          </LedgerRow>
          <LedgerRow label="Active">{user.is_active ? "yes" : "no"}</LedgerRow>
          <LedgerRow label="Verified">
            {user.is_verified ? "yes" : "no"}
          </LedgerRow>
          <LedgerRow label="Created">
            <span className="tech-token">{user.created_at ?? "—"}</span>
          </LedgerRow>
        </dl>
      </CertCard>

      <section className="mt-10">
        <SectionRule label="Firm role controls" />
        <p className="mt-2 text-xs text-muted">
          These are deployment controls for firms that enforce role
          gates. By default the gates are dormant — hosted evaluation
          lets everyone run matters — so changing a role here has no
          effect unless your deployment turns firm role enforcement on.
          Self-promotion is blocked: another superuser must change your
          role. Setting a user to the role they already hold is a no-op
          and writes no audit row.
        </p>
        <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-muted">
            <span className="mb-1 text-[10px] uppercase tracking-[0.18em]">
              Role
            </span>
            <select
              data-testid="role-select"
              value={draftRole}
              onChange={(e) =>
                setDraftRole(e.target.value as UserRole | "")
              }
              className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-ink"
              disabled={isSelf}
            >
              {ALLOWED_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            data-testid="role-submit"
            disabled={
              isSelf || !draftRole || roleUnchanged || m.kind === "submitting"
            }
            className="inline-flex items-center rounded-md bg-ink px-4 py-1.5 text-sm text-paper hover:bg-seal transition-colors disabled:opacity-50"
          >
            {m.kind === "submitting" ? "Submitting…" : "Change role"}
          </button>
          {isSelf && (
            <p className="text-xs text-muted">
              You can't change your own role here — another superuser
              must act.
            </p>
          )}
        </form>

        {m.kind === "ok" && (
          <p className="mt-3 text-sm text-muted">
            Role set to{" "}
            <code className="tech-token">{m.newRole}</code>. A real change
            writes a <code className="tech-token">user.role.changed</code>{" "}
            audit row; setting a role that was already in place is a no-op
            and writes nothing. The audit trail is the source of truth for
            which happened.
          </p>
        )}
        {m.kind === "self_promotion_forbidden" && (
          <p className="mt-3 text-sm text-seal" data-testid="self-promo-banner">
            {m.message}
          </p>
        )}
        {m.kind === "invalid_role" && (
          <p className="mt-3 text-sm text-seal">
            Role{" "}
            <code className="tech-token">{m.supplied}</code> not in
            allowed set. Substrate allows:{" "}
            {m.allowed.map((r, i) => (
              <span key={r}>
                {i > 0 && ", "}
                <code className="tech-token">{r}</code>
              </span>
            ))}
            .
          </p>
        )}
        {m.kind === "error" && (
          <p className="mt-3 text-sm text-seal">{m.message}</p>
        )}
      </section>

      <section className="mt-10">
        <Link
          to="/admin/users"
          className="text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          ← All users
        </Link>
      </section>
    </div>
  );
}

function AdminRequiredShell() {
  return (
    <div className="page-shell">
      <PageHeader
        title="Admin required"
        description="Per-user admin surface requires superuser. Ask your workspace administrator if you need access."
      />
    </div>
  );
}
