/**
 * Phase 14 F — /admin/users/{userId}.
 *
 * Shows the substrate's UserAdminRead fields + a role-mutation form.
 *
 * Substrate truth (backend/app/api/admin_users.py):
 *   - POST /api/admin/users/{id}/role takes {role} ONLY. The audit
 *     reason is server-hardcoded to "manual_admin_action"
 *     (admin_users.py:182). Operator-supplied reasons would be a
 *     backend phase (Phase 14 v2 decision #8); UI does not collect.
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

type Query =
  | { status: "loading" }
  | { status: "ready"; user: UserAdminRead }
  | { status: "admin_required" }
  | { status: "not_found" }
  | { status: "error"; message: string };

type Mutation =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "noop" }
  | { kind: "ok"; newRole: string }
  | { kind: "self_promotion_forbidden"; message: string }
  | { kind: "invalid_role"; supplied: string; allowed: string[] }
  | { kind: "error"; message: string };

export function AdminUserDetail({ userId }: { userId: string }) {
  const auth = useAuth();
  const [q, setQ] = useState<Query>({ status: "loading" });
  const [m, setM] = useState<Mutation>({ kind: "idle" });
  const [draftRole, setDraftRole] = useState<UserRole | "">("");

  useEffect(() => {
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
  }, [userId]);

  if (!auth.loading && auth.user && !auth.user.is_superuser) {
    return <AdminRequiredShell />;
  }
  if (q.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted">
        Loading user…
      </div>
    );
  }
  if (q.status === "admin_required") return <AdminRequiredShell />;
  if (q.status === "not_found") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-serif">User not found</h1>
        <p className="mt-3 text-sm">
          <Link
            to="/admin/users"
            className="underline underline-offset-4 hover:text-ink"
          >
            ← All users
          </Link>
        </p>
      </div>
    );
  }
  if (q.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-serif">Could not load user</h1>
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
      if (updated.role === user.role) {
        // Substrate already had this role — Phase 11 idempotent path
        // (200, no audit row). Be honest about it.
        setM({ kind: "noop" });
      } else {
        setM({ kind: "ok", newRole: updated.role });
        setQ({ status: "ready", user: { ...user, role: updated.role } });
      }
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
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Admin · user</p>
      <h1 className="mt-2 text-3xl font-serif">{user.email}</h1>
      <p className="mt-1 text-xs font-mono text-muted">{user.id}</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <DT label="Name">{user.name || "—"}</DT>
        <DT label="Role">
          <code className="font-mono text-xs">{user.role}</code>
        </DT>
        <DT label="Superuser">{user.is_superuser ? "yes" : "no"}</DT>
        <DT label="Active">{user.is_active ? "yes" : "no"}</DT>
        <DT label="Verified">{user.is_verified ? "yes" : "no"}</DT>
        <DT label="Created">{user.created_at ?? "—"}</DT>
      </dl>

      <section className="mt-10">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Change role
        </h2>
        <p className="mt-2 text-xs text-muted">
          Body is <code className="font-mono">{`{role}`}</code> only —
          the substrate hardcodes the audit reason to{" "}
          <code className="font-mono">manual_admin_action</code>. Same-role
          POST is a no-op; no audit row is written. Self-promotion is
          forbidden — another superuser must act.
        </p>
        <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-muted">
            <span className="mb-1">Role</span>
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
            className="inline-flex items-center rounded-md bg-ink px-4 py-1.5 text-sm text-paper hover:opacity-90 disabled:opacity-50"
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
            Role changed to{" "}
            <code className="font-mono">{m.newRole}</code>. Substrate
            audit row: <code className="font-mono">user.role.changed</code>.
          </p>
        )}
        {m.kind === "noop" && (
          <p className="mt-3 text-sm text-muted">
            Already on this role — no change. Idempotent POST does not
            emit an audit row.
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
            <code className="font-mono">{m.supplied}</code> not in
            allowed set. Substrate allows:{" "}
            {m.allowed.map((r, i) => (
              <span key={r}>
                {i > 0 && ", "}
                <code className="font-mono">{r}</code>
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
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          ← All users
        </Link>
      </section>
    </div>
  );
}

function DT({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function AdminRequiredShell() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Admin</p>
      <h1 className="mt-2 text-2xl font-serif">Admin required</h1>
      <p className="mt-3 text-sm text-muted">
        Per-user admin surface requires superuser. Ask your workspace
        administrator if you need access.
      </p>
    </div>
  );
}
