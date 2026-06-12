// Auth + user-profile endpoints.
//
// Auth lives at the backend origin under `/auth`, NOT under `/api`. See
// `backend/app/main.py`:
//   app.include_router(auth_router, prefix="/auth", ...)
// so all routes here resolve against `AUTH`, not `API`.

import { apiFetch, BACKEND_ROOT } from "./_core";

export const AUTH = BACKEND_ROOT ? `${BACKEND_ROOT}/auth` : "/auth";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  // v0.1 plan tier - display only. No billing enforcement.
  plan: string;
  default_model_id: string | null;
  default_privilege_posture: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_superuser: boolean;
}

export interface AuthError extends Error {
  status: number;
  detail: unknown;
}

async function readDetail(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function authJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await readDetail(res);
    const err = new Error(
      `${res.status} ${res.statusText}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    ) as AuthError;
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  // Some endpoints (logout, verify) return 204 no body.
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as unknown as T;
  }
  const ct = res.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) {
    return undefined as unknown as T;
  }
  return res.json() as Promise<T>;
}

export const getCurrentUser = async (): Promise<CurrentUser | null> => {
  const res = await apiFetch(`${AUTH}/users/me`);
  if (res.status === 401) return null;
  return authJsonOrThrow<CurrentUser>(res);
};

export const signin = (email: string, password: string) =>
  apiFetch(`${AUTH}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }).toString(),
  }).then((r) => authJsonOrThrow<unknown>(r));

export const signout = () =>
  apiFetch(`${AUTH}/logout`, { method: "POST" }).then((r) => authJsonOrThrow<unknown>(r));

// Optional demand-capture fields (Gate 4). Both honest and optional:
// persona is self-reported; channel is the ?c= launch tag (see
// src/lib/channel.ts). Backend allowlists both — invalid values are
// dropped server-side, never a signup failure.
export interface SignupCapture {
  persona?: string | null;
  channel?: string | null;
}

export const signup = (
  email: string,
  password: string,
  name: string = "",
  capture: SignupCapture = {},
) =>
  apiFetch(`${AUTH}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name,
      ...(capture.persona ? { persona: capture.persona } : {}),
      ...(capture.channel ? { channel: capture.channel } : {}),
    }),
  }).then((r) => authJsonOrThrow<CurrentUser>(r));

export const forgotPassword = (email: string) =>
  apiFetch(`${AUTH}/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then((r) => authJsonOrThrow<unknown>(r));

export const resetPassword = (token: string, password: string) =>
  apiFetch(`${AUTH}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  }).then((r) => authJsonOrThrow<unknown>(r));

export const verifyEmail = (token: string) =>
  apiFetch(`${AUTH}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).then((r) => authJsonOrThrow<CurrentUser>(r));

export const requestVerifyToken = (email: string) =>
  apiFetch(`${AUTH}/request-verify-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then((r) => authJsonOrThrow<unknown>(r));

export interface UserProfileUpdate {
  name?: string;
  default_model_id?: string | null;
  default_privilege_posture?: string | null;
  password?: string;
}

export const updateProfile = (body: UserProfileUpdate) =>
  apiFetch(`${AUTH}/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => authJsonOrThrow<CurrentUser>(r));
