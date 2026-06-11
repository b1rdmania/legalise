/**
 * /admin/users.
 *
 * Lists workspace users with optional role + is_superuser filters.
 * The substrate endpoint is superuser-only — non-superusers see an
 * inline "admin required" message rather than a stack trace,
 * mirroring the no-smuggled-authority discipline used elsewhere.
 *
 * Reviewer-narrow per the F brief:
 *   - No row-level role editor here — clicking a row navigates to
 *     /admin/users/{id} for the mutation UI.
 *   - No bulk operations.
 *   - No invite / disable / delete user — substrate doesn't expose
 *     those endpoints today.
 *   - No global audit view (finding 14-B-#2 stays open).
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AdminRequiredError,
  ALLOWED_ROLES,
  listAdminUsers,
  type UserAdminRead,
  type UserRole,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../ui/primitives";

type Query =
  | { status: "loading" }
  | { status: "ready"; users: UserAdminRead[] }
  | { status: "admin_required" }
  | { status: "error"; message: string };

type SuperuserFilter = "" | "true" | "false";

export function AdminUsersList() {
  const auth = useAuth();
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [superFilter, setSuperFilter] = useState<SuperuserFilter>("");
  const [q, setQ] = useState<Query>({ status: "loading" });

  // UI-side gate FIRST. The substrate enforces too — but firing the
  // admin endpoint from a non-admin viewer is the smuggled-authority
  // pattern ACCEPTANCE §12 forbids. Gate the fetch on the auth state
  // BEFORE scheduling it.
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user || !auth.user.is_superuser) {
      setQ({ status: "admin_required" });
      return;
    }
    let cancelled = false;
    setQ({ status: "loading" });
    listAdminUsers({
      role: roleFilter || undefined,
      is_superuser:
        superFilter === "" ? undefined : superFilter === "true",
    })
      .then((users) => {
        if (!cancelled) setQ({ status: "ready", users });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AdminRequiredError) {
          setQ({ status: "admin_required" });
          return;
        }
        setQ({ status: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.user, roleFilter, superFilter]);

  // Render-time gate alongside the effect gate. Belt-and-braces with
  // the effect — if auth.user resolves to non-admin mid-render, the
  // shell renders immediately; the effect short-circuit ensures no
  // call was ever fired.
  if (!auth.loading && auth.user && !auth.user.is_superuser) {
    return <AdminRequiredShell />;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <PageHeader
        display
        eyebrow="Workspace administration"
        eyebrowRight={
          q.status === "ready"
            ? `${q.users.length} user${q.users.length === 1 ? "" : "s"}`
            : undefined
        }
        title="Users"
        description="Every user in this workspace. Role changes happen on the per-user page; bulk operations are not exposed by the substrate."
      />

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-xs text-muted">
          <span className="mb-1">Role</span>
          <select
            data-testid="role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | "")}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-ink"
          >
            <option value="">— any —</option>
            {ALLOWED_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-muted">
          <span className="mb-1">Superuser</span>
          <select
            data-testid="superuser-filter"
            value={superFilter}
            onChange={(e) =>
              setSuperFilter(e.target.value as SuperuserFilter)
            }
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-ink"
          >
            <option value="">— any —</option>
            <option value="true">superusers only</option>
            <option value="false">non-superusers only</option>
          </select>
        </label>
      </div>

      {q.status === "loading" && (
        <p className="mt-8 text-sm text-muted">Loading users…</p>
      )}
      {q.status === "admin_required" && <AdminRequiredShell />}
      {q.status === "error" && (
        <p className="mt-8 text-sm text-seal">
          Could not load users: {q.message}
        </p>
      )}
      {q.status === "ready" && q.users.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          No users match the current filters.
        </p>
      )}
      {q.status === "ready" && q.users.length > 0 && (
        <div className="mt-8 overflow-x-auto rounded-md border border-line">
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[0.18em] text-muted">
              <tr className="border-b border-ink">
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Superuser</th>
                <th className="px-3 py-2 text-left">Verified</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {q.users.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-line"
                  data-testid={`user-row-${u.id}`}
                >
                  <td className="px-3 py-2 text-sm">{u.email}</td>
                  <td className="px-3 py-2 tech-token text-xs">{u.role}</td>
                  <td className="px-3 py-2 text-xs">
                    {u.is_superuser ? "yes" : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {u.is_verified ? "yes" : "no"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {u.is_active ? "yes" : "no"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {u.created_at ? u.created_at.slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/admin/users/$userId"
                      params={{ userId: u.id }}
                      className="text-xs underline underline-offset-4 hover:text-seal"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminRequiredShell() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <PageHeader
        eyebrow="Workspace administration"
        title="Admin required"
        description="The admin users surface requires superuser. Ask your workspace administrator if you need access."
      />
    </div>
  );
}
