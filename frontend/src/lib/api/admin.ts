// Admin user management (roles, superuser gates).
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";

// ---------------------------------------------------------------------------
// Admin users
// ---------------------------------------------------------------------------

// Locked vocabulary — substrate ALLOWED_ROLES at admin_users.py:52.
// workspace_admin is a settable role; it does NOT bypass posture gates
// (only qualified_solicitor satisfies B_mixed — substrate truth from
// posture_gate.py POSTURE_POLICY; the two axes are independent).
export const ALLOWED_ROLES = [
  "solicitor",
  "qualified_solicitor",
  "workspace_admin",
] as const;
export type UserRole = (typeof ALLOWED_ROLES)[number];

export interface UserAdminRead {
  id: string;
  email: string;
  role: string;
  is_superuser: boolean;
  is_active: boolean;
  is_verified: boolean;
  name: string;
  created_at: string | null;
}

export interface UserRoleOut {
  id: string;
  email: string;
  role: string;
  is_superuser: boolean;
}

export interface ListAdminUsersOptions {
  role?: UserRole;
  is_superuser?: boolean;
}

export class AdminRequiredError extends Error {
  readonly kind = "admin_required" as const;
  constructor(message: string) {
    super(message);
    this.name = "AdminRequiredError";
  }
}

export class SelfPromotionForbiddenError extends Error {
  readonly kind = "self_promotion_forbidden" as const;
  constructor(message: string) {
    super(message);
    this.name = "SelfPromotionForbiddenError";
  }
}

export class InvalidRoleError extends Error {
  readonly kind = "invalid_role" as const;
  constructor(
    message: string,
    public readonly supplied: string,
    public readonly allowed: string[],
  ) {
    super(message);
    this.name = "InvalidRoleError";
  }
}

async function readEnv(res: Response): Promise<{
  detail?: {
    error?: string;
    message?: string;
    supplied?: string;
    allowed?: string[];
  };
}> {
  try {
    return (await res.json()) as {
      detail?: {
        error?: string;
        message?: string;
        supplied?: string;
        allowed?: string[];
      };
    };
  } catch {
    return {};
  }
}

export const listAdminUsers = async (
  opts: ListAdminUsersOptions = {},
): Promise<UserAdminRead[]> => {
  const params = new URLSearchParams();
  if (opts.role !== undefined) params.set("role", opts.role);
  if (opts.is_superuser !== undefined) {
    params.set("is_superuser", String(opts.is_superuser));
  }
  const qs = params.toString();
  const res = await apiFetch(`${API}/admin/users${qs ? `?${qs}` : ""}`);
  if (res.status === 403) {
    const env = await readEnv(res);
    throw new AdminRequiredError(
      env.detail?.message ?? "Endpoint requires superuser.",
    );
  }
  return jsonOrThrow<UserAdminRead[]>(res);
};

export const getAdminUser = async (userId: string): Promise<UserAdminRead> => {
  const res = await apiFetch(`${API}/admin/users/${encodeURIComponent(userId)}`);
  if (res.status === 403) {
    const env = await readEnv(res);
    throw new AdminRequiredError(
      env.detail?.message ?? "Endpoint requires superuser.",
    );
  }
  return jsonOrThrow<UserAdminRead>(res);
};

// POST body is {role} ONLY — substrate RoleChangeRequest at
// admin_users.py:57. Operator-supplied "reason" is a backend
// concern, not a frontend invention.
export const changeUserRole = async (
  userId: string,
  role: UserRole,
): Promise<UserRoleOut> => {
  const res = await apiFetch(
    `${API}/admin/users/${encodeURIComponent(userId)}/role`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  if (res.status === 403) {
    const env = await readEnv(res);
    if (env.detail?.error === "self_promotion_forbidden") {
      throw new SelfPromotionForbiddenError(
        env.detail?.message ??
          "Superusers cannot change their own role via this endpoint.",
      );
    }
    throw new AdminRequiredError(
      env.detail?.message ?? "Endpoint requires superuser.",
    );
  }
  if (res.status === 422) {
    const env = await readEnv(res);
    if (env.detail?.error === "invalid_role") {
      throw new InvalidRoleError(
        `Role ${env.detail?.supplied ?? "?"} not in allowed set.`,
        env.detail?.supplied ?? role,
        env.detail?.allowed ?? Array.from(ALLOWED_ROLES),
      );
    }
  }
  return jsonOrThrow<UserRoleOut>(res);
};
