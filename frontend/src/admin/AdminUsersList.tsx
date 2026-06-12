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
import { LedgerLine, SectionRule } from "../ui/certificate";

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
    <div className="page-shell">
      <PageHeader
        display
        title="Users"
        whisper="The roll of practitioners"
        description="Every practitioner admitted to this workspace, entered in the order the roll holds them. The roll records; it does not act. A role is changed on the practitioner's own page, and the substrate exposes no bulk operations."
      />

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-muted">
          <span className="mb-1 text-[10px] uppercase tracking-[0.18em]">
            Role
          </span>
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
        <label className="flex flex-col text-muted">
          <span className="mb-1 text-[10px] uppercase tracking-[0.18em]">
            Superuser
          </span>
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
        <section className="mt-8">
          <SectionRule label="The roll" right={String(q.users.length)} />
          <div className="mt-1">
            {q.users.map((u, i) => {
              const flags = [
                u.is_superuser ? "superuser" : null,
                u.is_verified ? null : "unverified",
                u.is_active ? null : "inactive",
              ].filter(Boolean);
              return (
                <LedgerLine
                  key={u.id}
                  index={i + 1}
                  label={u.role.replaceAll("_", " ")}
                  testid={`user-row-${u.id}`}
                  right={
                    <span className="flex items-baseline gap-3">
                      <span className="tech-token text-[11px] text-muted">
                        {u.created_at ? u.created_at.slice(0, 10) : "—"}
                      </span>
                      <Link
                        to="/admin/users/$userId"
                        params={{ userId: u.id }}
                        className="text-sm text-muted hover:text-seal"
                      >
                        Open →
                      </Link>
                    </span>
                  }
                >
                  <span className="text-ink">{u.email}</span>
                  {flags.length > 0 && (
                    <span className="ml-2 text-[11px] text-muted">
                      {flags.join(" · ")}
                    </span>
                  )}
                </LedgerLine>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function AdminRequiredShell() {
  return (
    <div className="page-shell">
      <PageHeader
        title="Admin required"
        description="The admin users surface requires superuser. Ask your workspace administrator if you need access."
      />
    </div>
  );
}
