// Thin fetch wrapper for the Legalise backend.
// All endpoints live under /api.

export interface Matter {
  id: string;
  slug: string;
  title: string;
  matter_type: string;
  cause: string | null;
  status: string;
  case_theory: string | null;
  pivot_fact: string | null;
  privilege_posture: string;
  default_model_id: string;
  facts: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  retention_until: string | null;
  created_by_id: string;
}

export interface MatterDocument {
  id: string;
  matter_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  tag: string | null;
  from_disclosure: boolean;
  uploaded_at: string;
  uploaded_by_id: string;
}

export interface MatterCreate {
  title: string;
  matter_type?: string;
  cause?: string | null;
  case_theory?: string | null;
  pivot_fact?: string | null;
  privilege_posture?: string;
  default_model_id?: string;
  facts?: Record<string, unknown>;
  retention_until?: string | null;
}

// API prefix. In dev/self-host the Vite proxy or compose network resolves
// `/api/...` to the backend. On a split live deploy (Cloudflare Pages +
// Fly.io backend), set VITE_API_BASE_URL at build time to the absolute
// API root including the `/api` segment — e.g.
// `VITE_API_BASE_URL=https://api.legalise.dev/api`. Backend routes are
// mounted under `/api/...` regardless of host, so the env var carries
// both the origin and the `/api` segment.
export const API = import.meta.env.VITE_API_BASE_URL || "/api";

// Backend origin (no `/api` suffix). The health endpoint lives at the
// backend root, not under /api, so it needs the origin alone.
export const BACKEND_ROOT = API.replace(/\/api\/?$/, "") || "";

// Typed error for the canonical 422 provider_key_missing envelope:
// `{detail: {error: "provider_key_missing", provider, message}}`.
// Callers catch this with `instanceof ProviderKeyMissingError` so they
// can render the inline "add a key in Settings" banner instead of a
// generic error blob.
export class ProviderKeyMissingError extends Error {
  readonly provider: string;
  readonly status = 422;
  constructor(provider: string, message: string) {
    super(message || `Provider key missing for ${provider}.`);
    this.name = "ProviderKeyMissingError";
    this.provider = provider;
  }
}

// Inspect a 422 body for the canonical provider_key_missing envelope
// and return a typed error. Tolerant of both `{detail: {...}}` (FastAPI
// HTTPException) and a bare `{error, provider, message}` payload.
export function providerKeyMissingFromBody(body: unknown): ProviderKeyMissingError | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const candidate =
    obj.detail && typeof obj.detail === "object" ? (obj.detail as Record<string, unknown>) : obj;
  if (candidate.error !== "provider_key_missing") return null;
  const provider = typeof candidate.provider === "string" ? candidate.provider : "unknown";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return new ProviderKeyMissingError(provider, message);
}

// Structured upstream-provider error. Backend returns
//   502 { detail: { error: "provider_invalid_key" | ..., provider, upstream_status, message } }
// when an Anthropic / OpenAI / Ollama call fails. Surfacing the code on
// a typed error lets the UI render a friendly banner instead of an
// opaque "Error: 502 ...".
export type ProviderUpstreamCode =
  | "provider_invalid_key"
  | "provider_rate_limited"
  | "provider_overloaded"
  | "provider_error";

export class ProviderUpstreamError extends Error {
  readonly code: ProviderUpstreamCode;
  readonly provider: string;
  readonly upstreamStatus: number | null;
  constructor(
    code: ProviderUpstreamCode,
    provider: string,
    upstreamStatus: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderUpstreamError";
    this.code = code;
    this.provider = provider;
    this.upstreamStatus = upstreamStatus;
  }
}

const _PROVIDER_UPSTREAM_CODES = new Set<ProviderUpstreamCode>([
  "provider_invalid_key",
  "provider_rate_limited",
  "provider_overloaded",
  "provider_error",
]);

// Attempt to read a `ProviderUpstreamError` out of an arbitrary detail
// object. Returns null if the shape doesn't match. Accepts both the
// router envelope (`{detail: {error, provider, ...}}`) and the SSE
// stream envelope (`{error, provider, ...}`).
export function tryParseProviderUpstream(value: unknown): ProviderUpstreamError | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const detail = v.detail && typeof v.detail === "object" ? (v.detail as Record<string, unknown>) : v;
  const code = detail.error;
  if (typeof code !== "string") return null;
  if (!_PROVIDER_UPSTREAM_CODES.has(code as ProviderUpstreamCode)) return null;
  const provider = typeof detail.provider === "string" ? detail.provider : "unknown";
  const upstream = typeof detail.upstream_status === "number" ? detail.upstream_status : null;
  const message = typeof detail.message === "string" ? detail.message : `${provider}: ${code}`;
  return new ProviderUpstreamError(code as ProviderUpstreamCode, provider, upstream, message);
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 422) {
      // Try the structured envelope before falling back to a text throw.
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Not JSON. Fall through to the generic throw below.
      }
      const pk = providerKeyMissingFromBody(parsed);
      if (pk) throw pk;
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    const text = await res.text();
    if (res.status === 502) {
      try {
        const body = JSON.parse(text);
        const parsed = tryParseProviderUpstream(body);
        if (parsed) throw parsed;
      } catch (e) {
        if (e instanceof ProviderUpstreamError) throw e;
        // not JSON, fall through to the generic Error
      }
    }
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Translate a `ProviderUpstreamError` code into a human readable banner
// string. `{provider}` is substituted with the actual provider name so
// the same map serves Anthropic, OpenAI, and Ollama.
export function providerUpstreamMessage(err: ProviderUpstreamError): string {
  const provider = err.provider.charAt(0).toUpperCase() + err.provider.slice(1);
  switch (err.code) {
    case "provider_invalid_key":
      return `${provider} rejected the API key. Re-check it in Settings.`;
    case "provider_rate_limited":
      return `${provider} is rate-limiting requests. Try again in a moment.`;
    case "provider_overloaded":
      return `${provider} is overloaded. Try again shortly.`;
    case "provider_error":
    default:
      return `${provider} returned an error. Check Settings or try a different model.`;
  }
}

// Every authenticated cross-origin call MUST send the session cookie
// Cookie/CORS coherence invariant. All app fetches
// route through `apiFetch` so `credentials: "include"` is uniform.
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}

export interface BootstrapState {
  user_count: number;
  has_superuser: boolean;
  // Phase 17.5 — when false (default), the firm role hierarchy is
  // dormant: don't present B_mixed qualified-solicitor blockers.
  firm_role_gates_enabled?: boolean;
}

// Phase 13b C — no auth required. The /app first-run screen reads this
// to decide between empty-state / bootstrap-required / authed-home.
export const getBootstrapState = () =>
  apiFetch(`${API}/system/bootstrap-state`).then((r) =>
    jsonOrThrow<BootstrapState>(r),
  );

// ---------------------------------------------------------------------------
// Phase 14 B — v2 module catalog + trust ceremony
// ---------------------------------------------------------------------------

export interface V2ManifestEntry {
  module_id: string;
  source_kind: string;
  manifest: Record<string, unknown>;
  is_valid: boolean;
  validation_errors: Array<{ path: string; message: string }>;
}

export interface V2RegistryResponse {
  modules: V2ManifestEntry[];
  ui_slots: string[];
}

export const getModulesV2 = () =>
  apiFetch(`${API}/modules/v2`).then((r) =>
    jsonOrThrow<V2RegistryResponse>(r),
  );

export const getModuleV2 = (moduleId: string) =>
  apiFetch(`${API}/modules/v2/${encodeURIComponent(moduleId)}`).then((r) =>
    jsonOrThrow<V2ManifestEntry>(r),
  );

// Module Standalone + Create Module v1 — read-only manifest validation
// (same validator as install). Authed; no DB write / ceremony / audit.
export interface ManifestValidationError {
  path: string;
  message: string;
}
export interface ValidateManifestResult {
  valid: boolean;
  errors: ManifestValidationError[];
}
export const validateManifest = (manifest: unknown) =>
  apiFetch(`${API}/modules/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest }),
  }).then((r) => jsonOrThrow<ValidateManifestResult>(r));

// Phase 14.5 B — installed-modules listing. One row per module_id
// (most recent installed_at). Frontend uses it for the catalog
// badge and as one AND clause in GrantsPanel.runnablePairs.
export interface InstalledModule {
  module_id: string;
  version: string;
  publisher: string;
  visibility: string;
  signature_status: string;
  enabled: boolean;
  installed_at: string;
  installed_by_user_id: string | null;
}

export const listInstalledModules = () =>
  apiFetch(`${API}/modules/installed`).then((r) =>
    jsonOrThrow<InstalledModule[]>(r),
  );

export interface CeremonyPermissionCard {
  module_id: string;
  module_name?: string;
  publisher?: string;
  publisher_verified?: boolean;
  signature_status?: string;
  visibility?: string;
  version?: string;
  capabilities?: unknown[];
  data_movement_summary?: unknown;
  gates?: unknown;
  advice_tier_max?: string;
  audit_events?: unknown[];
  dependencies?: unknown[];
}

export interface CeremonyResponse {
  ceremony_id: string;
  module_id: string;
  state: string;
  fast_path: boolean;
  is_terminal: boolean;
  permission_card: CeremonyPermissionCard;
  history: Array<Record<string, unknown>>;
}

export type CeremonyAction = "trust" | "reject" | "grant";

export interface StartInstallRequest {
  source: "registry" | "manifest";
  module_id?: string;
  manifest?: Record<string, unknown>;
  signature?: string;
}

export const startInstall = (body: StartInstallRequest) =>
  apiFetch(`${API}/modules/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<CeremonyResponse>(r));

export const getCeremony = (ceremonyId: string) =>
  apiFetch(`${API}/modules/install/${encodeURIComponent(ceremonyId)}`).then(
    (r) => jsonOrThrow<CeremonyResponse>(r),
  );

/**
 * Distinguishable error for the 409 invalid-transition path so the
 * stepper can render a structured banner with the substrate's
 * `module.ceremony.rejected` audit row in mind. The reason + message
 * are populated from the substrate's structured detail body.
 */
export class InvalidCeremonyTransitionError extends Error {
  readonly kind = "invalid_ceremony_transition" as const;
  constructor(
    message: string,
    public readonly ceremonyId: string,
    public readonly requestedAction: CeremonyAction,
  ) {
    super(message);
    this.name = "InvalidCeremonyTransitionError";
  }
}

export const advanceCeremony = async (
  ceremonyId: string,
  action: CeremonyAction,
): Promise<CeremonyResponse> => {
  const res = await apiFetch(
    `${API}/modules/install/${encodeURIComponent(ceremonyId)}/advance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
  if (res.status === 409) {
    let body: { detail?: { message?: string } } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // fall through
    }
    throw new InvalidCeremonyTransitionError(
      body?.detail?.message ?? "Invalid ceremony transition",
      ceremonyId,
      action,
    );
  }
  return jsonOrThrow<CeremonyResponse>(res);
};

export interface UpdateModuleRequest {
  new_manifest: Record<string, unknown>;
  signature?: string;
}

export interface UpdateModuleResponse {
  module_id: string;
  new_version: string;
  expansion_detected: boolean;
  expansion_report: Record<string, unknown>;
  ceremony_id: string | null;
}

export const updateModuleV2 = (moduleId: string, body: UpdateModuleRequest) =>
  apiFetch(`${API}/modules/${encodeURIComponent(moduleId)}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<UpdateModuleResponse>(r));

export const revokeModuleV2 = (moduleId: string) =>
  apiFetch(`${API}/modules/${encodeURIComponent(moduleId)}/revoke`, {
    method: "POST",
  }).then((r) => jsonOrThrow<{ module_id: string; disabled_rows: number; revoked_grants: number }>(r));

// ---------------------------------------------------------------------------
// Phase 14 C — matter-scoped grants
// ---------------------------------------------------------------------------

export interface GrantRow {
  id: string;
  plugin: string;
  skill: string;
  capability: string;
  scope_type: string;
  scope_id: string | null;
  granted_at: string | null;
}

export interface GrantListResponse {
  matter_id: string;
  grants: GrantRow[];
}

export interface GrantCreateResponse {
  matter_id: string;
  parent_capability_id: string;
  module_id: string;
  grants: GrantRow[];
  was_idempotent_noop: boolean;
}

export const listGrants = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/grants`).then((r) =>
    jsonOrThrow<GrantListResponse>(r),
  );

/**
 * Distinguishable errors for the substrate's two non-200 paths on
 * grant creation. Phase 7 returns:
 *   - 404 module_not_installed
 *   - 409 module_disabled (installed but admin disabled it)
 * Both carry structured bodies the substrate documents at
 * backend/app/api/grants.py:156-175.
 */
export class ModuleNotInstalledError extends Error {
  readonly kind = "module_not_installed" as const;
  constructor(message: string, public readonly moduleId: string) {
    super(message);
    this.name = "ModuleNotInstalledError";
  }
}

export class ModuleDisabledError extends Error {
  readonly kind = "module_disabled" as const;
  constructor(message: string, public readonly moduleId: string) {
    super(message);
    this.name = "ModuleDisabledError";
  }
}

export const createGrant = async (
  slug: string,
  body: { module_id: string; capability_id: string },
): Promise<GrantCreateResponse> => {
  const res = await apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/grants`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 404) {
    let parsed: { detail?: { error?: string; module_id?: string } } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      // fall through
    }
    if (parsed?.detail?.error === "module_not_installed") {
      throw new ModuleNotInstalledError(
        `Module ${body.module_id} is not installed on this workspace.`,
        body.module_id,
      );
    }
  }
  if (res.status === 409) {
    let parsed: { detail?: { error?: string; message?: string } } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      // fall through
    }
    if (parsed?.detail?.error === "module_disabled") {
      throw new ModuleDisabledError(
        parsed.detail.message ?? "Module is currently disabled.",
        body.module_id,
      );
    }
  }
  return jsonOrThrow<GrantCreateResponse>(res);
};

export const revokeGrant = (slug: string, grantId: string) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/grants/${encodeURIComponent(grantId)}`,
    { method: "DELETE" },
  ).then((r) => {
    if (r.status === 204) return;
    return jsonOrThrow<unknown>(r).then(() => undefined);
  });

// ---------------------------------------------------------------------------
// Phase 14 D — invocation + artifacts
// ---------------------------------------------------------------------------

export interface InvocationResponse {
  invocation_id: string;
  module_id: string;
  capability_id: string;
  matter_id: string;
  result: Record<string, unknown>;
}

/**
 * Substrate truth (backend/app/api/invocations.py): every non-200 path
 * returns a structured body with an `error` discriminator. Surfacing
 * each as a typed error lets the runner branch on `instanceof` rather
 * than parse strings.
 */
export class PostureBlockedError extends Error {
  readonly kind = "posture_gate_blocked" as const;
  constructor(
    message: string,
    public readonly posture: string,
    public readonly requiredRole: string,
    public readonly actorRole: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "PostureBlockedError";
  }
}

export class CapabilityDeniedError extends Error {
  readonly kind = "capability_denied" as const;
  constructor(
    message: string,
    public readonly plugin: string,
    public readonly skill: string,
    public readonly capability: string,
  ) {
    super(message);
    this.name = "CapabilityDeniedError";
  }
}

export class Phase1BlockedError extends Error {
  readonly kind = "phase1_blocked" as const;
  constructor(
    message: string,
    public readonly blockedReason: string,
    public readonly gateState: Record<string, unknown>,
  ) {
    super(message);
    this.name = "Phase1BlockedError";
  }
}

export class ProviderKeyMissingForInvokeError extends Error {
  readonly kind = "provider_key_missing" as const;
  constructor(message: string, public readonly provider: string | null) {
    super(message);
    this.name = "ProviderKeyMissingForInvokeError";
  }
}

export class ProviderUpstreamInvokeError extends Error {
  readonly kind = "provider_upstream_error" as const;
  constructor(
    message: string,
    public readonly provider: string | null,
    public readonly code: string | null,
    public readonly upstreamStatus: number | null,
  ) {
    super(message);
    this.name = "ProviderUpstreamInvokeError";
  }
}

export class InvocationInvalidArgsError extends Error {
  readonly kind = "invalid_args" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvocationInvalidArgsError";
  }
}

interface ErrorEnvelope {
  detail?: {
    error?: string;
    message?: string;
    posture?: string;
    required_role?: string;
    actor_role?: string;
    reason?: string;
    plugin?: string;
    skill?: string;
    capability?: string;
    blocked_reason?: string;
    gate_state?: Record<string, unknown>;
    provider?: string;
    code?: string;
    upstream_status?: number;
  };
}

async function readInvocationEnvelope(
  res: Response,
): Promise<ErrorEnvelope> {
  try {
    return (await res.json()) as ErrorEnvelope;
  } catch {
    return {};
  }
}

export const invokeCapability = async (
  slug: string,
  body: { module_id: string; capability_id: string; args?: Record<string, unknown> },
): Promise<InvocationResponse> => {
  const res = await apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: {}, ...body }),
    },
  );
  if (res.ok) return jsonOrThrow<InvocationResponse>(res);

  const env = await readInvocationEnvelope(res);
  const d = env.detail ?? {};
  switch (d.error) {
    case "posture_gate_blocked":
      throw new PostureBlockedError(
        d.message ?? "Posture gate blocked invocation.",
        d.posture ?? "unknown",
        d.required_role ?? "unknown",
        d.actor_role ?? "unknown",
        d.reason ?? "posture_gate_failed",
      );
    case "capability_denied":
      throw new CapabilityDeniedError(
        d.message ?? "Capability denied.",
        d.plugin ?? "",
        d.skill ?? "",
        d.capability ?? "",
      );
    case "phase1_blocked":
      throw new Phase1BlockedError(
        d.message ?? "Advice-boundary gate blocked invocation.",
        d.blocked_reason ?? "unknown",
        d.gate_state ?? {},
      );
    case "provider_key_missing":
      throw new ProviderKeyMissingForInvokeError(
        d.message ?? "Provider API key not configured.",
        d.provider ?? null,
      );
    case "provider_upstream_error":
      throw new ProviderUpstreamInvokeError(
        d.message ?? "Provider upstream error.",
        d.provider ?? null,
        d.code ?? null,
        d.upstream_status ?? null,
      );
    case "invalid_args":
      throw new InvocationInvalidArgsError(
        d.message ?? "Capability rejected the args.",
      );
    default:
      // Unknown structured error — fall back to a plain Error with the
      // full envelope so the runner UI can surface raw substrate text.
      throw new Error(
        `Invocation failed (${res.status}): ${d.error ?? "unknown"} — ${d.message ?? ""}`,
      );
  }
};

// Phase 13b A — matter artifacts
export interface ArtifactSummary {
  id: string;
  matter_id: string;
  module_id: string;
  capability_id: string;
  invocation_id: string;
  kind: string;
  created_by_id: string;
  created_at: string;
  size_bytes: number;
}

export interface ArtifactRead extends ArtifactSummary {
  payload: Record<string, unknown>;
}

export const listArtifacts = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/artifacts`).then((r) =>
    jsonOrThrow<ArtifactSummary[]>(r),
  );

export const readArtifact = (slug: string, artifactId: string) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/artifacts/${encodeURIComponent(artifactId)}`,
  ).then((r) => jsonOrThrow<ArtifactRead>(r));

// ---------------------------------------------------------------------------
// Supervisor Review v1 — review/approval over a matter artifact
// ---------------------------------------------------------------------------

export type ReviewState =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "overridden";

export type ReviewDecision = "approve" | "reject" | "request_changes" | "override";

export interface SupervisorReview {
  id: string;
  matter_id: string;
  artifact_id: string;
  invocation_id: string;
  module_id: string;
  capability_id: string;
  kind: string;
  artifact_hash: string;
  state: ReviewState;
  requested_by_id: string;
  requested_at: string;
  decided_by_id: string | null;
  decided_at: string | null;
  note: string | null;
}

export const listSupervisorReviews = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/reviews`).then((r) =>
    jsonOrThrow<{ matter_id: string; reviews: SupervisorReview[] }>(r),
  );

export const requestReview = (slug: string, artifactId: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifact_id: artifactId }),
  }).then((r) => jsonOrThrow<SupervisorReview>(r));

export const decideReview = (
  slug: string,
  reviewId: string,
  decision: ReviewDecision,
  note?: string,
) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/reviews/${encodeURIComponent(reviewId)}/decide`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note ?? null }),
    },
  ).then((r) => jsonOrThrow<SupervisorReview>(r));

// ---------------------------------------------------------------------------
// Phase 14 E — reconstruction (Phase 5 endpoint)
// ---------------------------------------------------------------------------

// The three legal source values per backend/app/core/audit_reconstruction.py.
export type ReconstructionSource = "audit" | "state_machine" | "advice_boundary";

export const ALL_RECONSTRUCTION_SOURCES: ReconstructionSource[] = [
  "audit",
  "state_machine",
  "advice_boundary",
];

export interface TimelineActor {
  user_id?: string;
  role?: string;
  email?: string;
  // Substrate-side actor dict can carry arbitrary keys.
  [k: string]: unknown;
}

export interface TimelineEntry {
  source: ReconstructionSource;
  occurred_at: string;
  action: string;
  actor: TimelineActor;
  matter_id: string | null;
  module_id: string | null;
  capability_id: string | null;
  payload: Record<string, unknown>;
  refs: Record<string, unknown>;
  source_row_id: string;
}

export interface ReconstructionResponse {
  entries: TimelineEntry[];
  next_cursor: string | null;
  total_in_window_estimate: number;
}

export interface ReconstructionOptions {
  since?: string;
  until?: string;
  include?: ReconstructionSource[];
  cursor?: string;
  limit?: number;
  // Phase 14.5 A — substrate-side filters. Pre-14.5 the frontend
  // filtered these client-side, which produced false-negatives on
  // dense matter timelines (Phase 14 E P1 redline). They're now
  // server-pushdown filters that apply BEFORE pagination.
  invocation_id?: string;
  action?: string;
}

// ---------------------------------------------------------------------------
// Phase 14 F — admin users
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
// admin_users.py:57. Operator-supplied "reason" is a backend phase,
// not a frontend invention (Phase 14 v2 decision #8).
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

// Phase 14.5 C — workspace / admin reconstruction. Same shape as
// the matter endpoint; no slug. Substrate gates on superuser; UI
// also gates upstream to avoid pointless 403s.
export const getAdminReconstruction = (
  opts: ReconstructionOptions = {},
): Promise<ReconstructionResponse> => {
  const params = new URLSearchParams();
  if (opts.since) params.set("since", opts.since);
  if (opts.until) params.set("until", opts.until);
  if (opts.include && opts.include.length > 0) {
    params.set("include", opts.include.join(","));
  }
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.invocation_id) params.set("invocation_id", opts.invocation_id);
  if (opts.action) params.set("action", opts.action);
  const qs = params.toString();
  return apiFetch(
    `${API}/admin/audit/reconstruction${qs ? `?${qs}` : ""}`,
  ).then((r) => jsonOrThrow<ReconstructionResponse>(r));
};

export const getReconstruction = (
  slug: string,
  opts: ReconstructionOptions = {},
): Promise<ReconstructionResponse> => {
  const params = new URLSearchParams();
  if (opts.since) params.set("since", opts.since);
  if (opts.until) params.set("until", opts.until);
  if (opts.include && opts.include.length > 0) {
    params.set("include", opts.include.join(","));
  }
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.invocation_id) params.set("invocation_id", opts.invocation_id);
  if (opts.action) params.set("action", opts.action);
  const qs = params.toString();
  return apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/audit/reconstruction${qs ? `?${qs}` : ""}`,
  ).then((r) => jsonOrThrow<ReconstructionResponse>(r));
};

export const listMatters = () =>
  apiFetch(`${API}/matters`).then((r) => jsonOrThrow<Matter[]>(r));

export const getMatter = (slug: string) =>
  apiFetch(`${API}/matters/${slug}`).then((r) => jsonOrThrow<Matter>(r));

export const createMatter = (body: MatterCreate) =>
  apiFetch(`${API}/matters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<Matter>(r));

export const listDocuments = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/documents`).then((r) => jsonOrThrow<MatterDocument[]>(r));

// Typed upload error. Lets the UI show a friendly inline banner for
// the three validation failures the backend enforces: unsupported MIME
// (415), declared MIME doesn't match magic bytes (415), and over the
// 25 MB cap (413). Anything else flows through as a generic Error
// from `jsonOrThrow`.
export type UploadErrorKind =
  | "unsupported_mime"
  | "magic_byte_mismatch"
  | "upload_too_large";

export class UploadError extends Error {
  kind: UploadErrorKind;
  status: number;
  constructor(kind: UploadErrorKind, status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.kind = kind;
    this.status = status;
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const uploadDocument = async (
  slug: string,
  file: File,
  tag?: string,
  fromDisclosure?: boolean,
): Promise<MatterDocument> => {
  const fd = new FormData();
  fd.append("file", file);
  if (tag) fd.append("tag", tag);
  if (fromDisclosure) fd.append("from_disclosure", "true");
  const res = await apiFetch(`${API}/matters/${slug}/documents`, {
    method: "POST",
    body: fd,
  });
  if (res.status === 413 || res.status === 415) {
    let detail: Record<string, unknown> | null = null;
    try {
      const body = (await res.json()) as { detail?: Record<string, unknown> };
      detail = body?.detail ?? null;
    } catch {
      detail = null;
    }
    if (res.status === 415) {
      const errKind = (detail?.error as string | undefined) ?? "unsupported_mime";
      if (errKind === "magic_byte_mismatch") {
        const declared = (detail?.declared_mime as string | null) || file.type || "the declared type";
        const inferred = (detail?.inferred_format as string | null) ?? "something else";
        throw new UploadError(
          "magic_byte_mismatch",
          415,
          `File contents do not match its declared type. Declared as ${declared}; the bytes look like ${inferred}. Re-export from the source app and try again.`,
        );
      }
      const got = (detail?.got as string | null) || file.type || "unknown";
      throw new UploadError(
        "unsupported_mime",
        415,
        `That file type is not supported (${got}). Upload a PDF, DOCX, DOC, TXT, MD, or RTF.`,
      );
    }
    const maxBytes = Number(detail?.max_bytes ?? 25 * 1024 * 1024);
    const gotBytes = Number(detail?.got_bytes ?? file.size);
    throw new UploadError(
      "upload_too_large",
      413,
      `File is too large (${formatMb(gotBytes)}). The limit is ${formatMb(maxBytes)} per document.`,
    );
  }
  return jsonOrThrow<MatterDocument>(res);
};

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor_id: string | null;
  matter_id: string | null;
  action: string;
  module: string | null;
  resource_type: string | null;
  resource_id: string | null;
  model_used: string | null;
  prompt_hash: string | null;
  response_hash: string | null;
  token_count: number | null;
  latency_ms: number | null;
  payload: Record<string, unknown>;
}

export const listAudit = (slug: string, limit = 50) =>
  apiFetch(`${API}/matters/${slug}/audit?limit=${limit}`).then((r) => jsonOrThrow<AuditEntry[]>(r));

export const setPrivilege = (slug: string, posture: string) =>
  apiFetch(`${API}/matters/${slug}/privilege`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privilege_posture: posture }),
  }).then((r) => jsonOrThrow<Matter>(r));

export interface PluginInvokeResponse {
  plugin: string;
  skill: string;
  matter_slug: string;
  response_text: string;
  model_used: string;
  token_count: number;
  latency_ms: number;
}

export const invokePlugin = (slug: string, plugin: string, skill: string, inputs: Record<string, unknown> = {}) =>
  apiFetch(`${API}/matters/${slug}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plugin, skill, inputs }),
  }).then((r) => jsonOrThrow<PluginInvokeResponse>(r));

// ----- Installed skill catalogue -----

export interface ModuleSkill {
  plugin: string;
  skill: string;
  name: string;
  description: string;
  source_url: string | null;
  argument_hint: string | null;
  capabilities: string[];
  trust_posture: string | null;
  enabled: boolean;
}

export interface ModulesResponse {
  plugins_root: string;
  source: {
    repo: string | null;
    ref: string | null;
  };
  skills: ModuleSkill[];
  broken: {
    plugin: string;
    skill: string;
    errors: { path: string; message: string }[];
  }[];
}

export const getModules = () =>
  apiFetch(`${API}/modules`).then((r) => jsonOrThrow<ModulesResponse>(r));

// Public, unauth-safe view of the catalogue. No workspace state - no
// `granted_capabilities`, no `enabled`. Backed by the same manifest
// resolver as `getModules`. Backend sends Cache-Control: max-age=300.
export interface PublicModuleSkill {
  plugin: string;
  skill: string;
  name: string;
  description: string;
  declared_capabilities: string[];
  trust_posture: string | null;
  source_url: string | null;
}

export interface PublicModulesResponse {
  source: {
    repo: string | null;
    ref: string | null;
  };
  skills: PublicModuleSkill[];
  broken: {
    plugin: string;
    skill: string;
    errors: { path: string; message: string }[];
  }[];
}

export const getPublicModules = () =>
  apiFetch(`${API}/modules/public`).then((r) => jsonOrThrow<PublicModulesResponse>(r));

// Per-matter workflows catalogue. State (grant, availability, last_run_at)
// is derived live on the backend from grants + audit + matter posture.
// `grant` is workspace-level capability coverage (do you hold the runtime
// capability types this workflow needs?), NOT per-skill enforcement.
export type WorkflowGrant = "granted" | "partial" | "blocked";
export type WorkflowAvailability =
  | "ok"
  | "blocked-by-posture"
  | "blocked-by-grant";

export interface WorkflowState {
  key: string;
  title: string;
  description: string;
  declared_capabilities: string[];
  granted_capabilities: string[];
  grant: WorkflowGrant;
  last_run_at: string | null;
  availability: WorkflowAvailability;
  reason: string | null;
}

export interface MatterWorkflowsResponse {
  workflows: WorkflowState[];
}

export const getMatterWorkflows = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/workflows`).then((r) =>
    jsonOrThrow<MatterWorkflowsResponse>(r),
  );

// Account-level operations. v0.1 ships only delete; v0.2 adds export.
// `deleteAccount` either succeeds with 204 (soft-delete + session
// revocation) or throws `AccountHasMattersError` (server returns 409
// with the matter count when the user owns matters).
export class AccountHasMattersError extends Error {
  readonly matterCount: number;
  constructor(matterCount: number) {
    super(
      `Account owns ${matterCount} matter${matterCount === 1 ? "" : "s"}. ` +
        "Export or delete matters before deleting the account.",
    );
    this.name = "AccountHasMattersError";
    this.matterCount = matterCount;
  }
}

export const deleteAccount = async (): Promise<void> => {
  const r = await apiFetch(`${AUTH}/users/me`, { method: "DELETE" });
  if (r.status === 204) return;
  if (r.status === 409) {
    let count = 0;
    try {
      const body = (await r.json()) as { detail?: { matter_count?: number } };
      count = body.detail?.matter_count ?? 0;
    } catch {
      // body parse failure — leave count at 0 and surface the generic message.
    }
    throw new AccountHasMattersError(count);
  }
  throw new Error(`deleteAccount: ${r.status} ${r.statusText}`);
};

export const getSkillBody = (plugin: string, skill: string) =>
  apiFetch(`${API}/modules/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}`).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`${r.status} ${r.statusText}: ${text}`);
    }
    return r.text();
  });

// ----- Pre-Motion -----

export interface PreMotionStageStatus {
  name: string;
  sub_agent_count: number;
  duration_ms: number;
  token_count: number;
  errors: string[];
}

export interface PreMotionFailureScenario {
  category: "procedural" | "substantive" | "evidentiary" | "strategic";
  scenario: string;
  probability: "High" | "Medium" | "Low";
  impact: "High" | "Medium" | "Low";
  mitigation: string;
}

export interface PreMotionEvidenceFlag {
  flag: string;
  severity: "high" | "medium" | "low";
  category: string;
  source_document?: string | null;
  source_documents?: string[] | null;
  event?: string | null;
  date?: string | null;
}

export interface PreMotionSynthesis {
  verdict: "steelman" | "borderline" | "strawman";
  verdict_reasoning: string;
  summary: string;
  failure_scenarios: PreMotionFailureScenario[];
  evidence_inconsistencies: { claim: string; issue: string; severity: "high" | "medium" | "low" }[];
  blind_spots: string[];
  if_we_lose_this_will_be_why: string;
}

export interface PreMotionOptimistic {
  key_arguments: { argument: string; supporting_evidence: string; case_law: string }[];
  supporting_evidence: { item: string; weight: "high" | "medium" | "low"; what_it_proves: string }[];
  expected_counterarguments: string[];
  optimistic_outcome: string;
}

export interface PreMotionRunResult {
  matter_slug: string;
  started_at: string;
  completed_at: string;
  total_duration_ms: number;
  total_token_count: number;
  model_used: string;
  stages: PreMotionStageStatus[];
  optimistic: PreMotionOptimistic;
  evidence_flags: PreMotionEvidenceFlag[];
  synthesis: PreMotionSynthesis;
}

export const runPreMotion = (slug: string, inputs: { depth?: "fast" | "thorough" } = {}) =>
  apiFetch(`${API}/matters/${slug}/pre-motion/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  }).then((r) => jsonOrThrow<PreMotionRunResult>(r));

export type PreMotionStreamEvent =
  | { event: "stage.start"; data: { stage: string; index: number; sub_agent_count: number } }
  | {
      event: "stage.end";
      data: {
        stage: string;
        index: number;
        name: string;
        sub_agent_count: number;
        duration_ms: number;
        token_count: number;
        errors: string[];
      };
    }
  | { event: "run.complete"; data: { verdict: string; total_duration_ms: number; total_token_count: number } }
  | { event: "result"; data: PreMotionRunResult }
  | { event: "error"; data: { message: string; code?: number } };

/**
 * Run Pre-Motion as an SSE stream. Returns an async iterator over typed
 * events. The pipeline keeps running server-side even if the iterator is
 * abandoned — audit rows always land.
 */
export async function* runPreMotionStream(
  slug: string,
  inputs: { depth?: "fast" | "thorough" } = {},
  signal?: AbortSignal,
): AsyncIterableIterator<PreMotionStreamEvent> {
  const resp = await apiFetch(`${API}/matters/${slug}/pre-motion/run-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text();
    if (resp.status === 422) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // not JSON
      }
      const pk = providerKeyMissingFromBody(parsed);
      if (pk) throw pk;
    }
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = JSON.parse(dataLines.join("\n"));
      yield { event, data } as PreMotionStreamEvent;
    }
  }
}

export async function exportPreMotionPdf(slug: string, result: PreMotionRunResult): Promise<Blob> {
  const resp = await apiFetch(`${API}/matters/${slug}/pre-motion/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  return resp.blob();
}

export interface ChronologyEvent {
  id: string;
  event_date: string;
  description: string;
  significance: number;
  source_doc_ids: string[];
  source_doc_filenames: string[];
  priv_flag: boolean;
  from_disclosure: boolean;
  proceedings_refs: string[];
  created_at: string;
  redacted: boolean;
}

export interface GateState {
  required: boolean;
  confirmed: boolean;
  confirmed_at: string | null;
  tainted_event_count: number;
}

export interface ChronologyResponse {
  matter_slug: string;
  events: ChronologyEvent[];
  gate: GateState;
  statement_of_facts_variant: ChronologyEvent[];
}

export const getChronology = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/chronology`).then((r) => jsonOrThrow<ChronologyResponse>(r));

export const confirmGate = (slug: string, acknowledgement: string) =>
  apiFetch(`${API}/matters/${slug}/chronology/gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acknowledgement }),
  }).then((r) => jsonOrThrow<GateState>(r));

// ----- Letters -----

export interface LetterType {
  id: string;
  label: string;
  plugin: string;
  skill: string;
  summary: string;
  is_default: boolean;
}

export interface LetterCatalogue {
  matter_slug: string;
  matter_type: string;
  letter_types: LetterType[];
}

export interface LetterDraft {
  matter_slug: string;
  letter_type: string;
  plugin: string;
  skill: string;
  draft_markdown: string;
  model_used: string;
  token_count: number;
  latency_ms: number;
}

export const getLetterCatalogue = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/letters/catalog`).then((r) => jsonOrThrow<LetterCatalogue>(r));

export const draftLetter = (slug: string, letterType: string, inputs: Record<string, string> = {}) =>
  apiFetch(`${API}/matters/${slug}/letters/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ letter_type: letterType, inputs }),
  }).then((r) => jsonOrThrow<LetterDraft>(r));

// ----- Document body + edit instructions (Phase A) -----------------------

export interface DocumentBody {
  document_id: string;
  kind: string;
  extracted_text: string;
  extraction_method: string;
  extracted_at: string;
  char_count: number;
  page_count: number | null;
  error_reason: string | null;
}

export type EditMode =
  | "tighten"
  | "rewrite"
  | "summarise"
  | "free-text"
  | "uk-jurisdiction-sweep";

export interface DocumentVersionRead {
  id: string;
  document_id: string;
  version_number: number;
  kind: string;
  created_by_id: string;
  created_at: string;
  storage_uri: string | null;
  notes: string | null;
}

export interface DocumentEditRead {
  id: string;
  document_version_id: string;
  change_id: string;
  correlation_id: string | null;
  deleted_text: string;
  inserted_text: string;
  context_before: string;
  context_after: string;
  rationale: string | null;
  status: string;
  created_at: string;
}

export interface EditInstructionResponse {
  version: DocumentVersionRead;
  pending_edits: DocumentEditRead[];
  model_used: string;
  model_notes: string;
  instruction_hash: string;
  parse_ok: boolean;
}

export const getDocumentBody = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/body`).then((r) =>
    jsonOrThrow<DocumentBody>(r),
  );

// Original File Retrieval v1 — browser-navigable URL for the streamed
// backend proxy. Used directly as an <a href> (open inline) or with
// download=1 (attachment); the browser handles the response, so this
// returns a URL rather than fetching bytes through React state.
export const documentOriginalUrl = (
  documentId: string,
  opts?: { download?: boolean },
): string =>
  `${API}/documents/${encodeURIComponent(documentId)}/original${
    opts?.download ? "?download=1" : ""
  }`;

// ---------------------------------------------------------------------------
// Matter lifecycle + export (LMF UX v1) — over the stable LMF endpoints
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface JobRead {
  id: string;
  matter_id: string;
  kind: string;
  status: JobStatus;
  stage: string | null;
  progress: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  result_payload: Record<string, unknown> | null;
}

export const createMatterExport = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/export`, {
    method: "POST",
  }).then((r) => jsonOrThrow<JobRead>(r));

export const getJob = (slug: string, jobId: string) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}`,
  ).then((r) => jsonOrThrow<JobRead>(r));

// Browser-navigable download URL for a completed export (302 presigned
// on S3, or a streamed attachment locally — the browser handles it).
export const matterExportDownloadUrl = (slug: string, jobId: string): string =>
  `${API}/matters/${encodeURIComponent(slug)}/export/${encodeURIComponent(jobId)}`;

export const closeMatter = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/close`, {
    method: "POST",
  }).then((r) => jsonOrThrow<Matter>(r));

export const deleteMatter = async (slug: string): Promise<void> => {
  const res = await apiFetch(`${API}/matters/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
};

export const postEditInstruction = (
  documentId: string,
  instruction: string,
  mode: EditMode,
) =>
  apiFetch(`${API}/documents/${documentId}/edit-instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, mode }),
  }).then((r) => jsonOrThrow<EditInstructionResponse>(r));

// ----- Generated .docx export (Phase B W1) ------------------------------

export interface GeneratedDocxResponse {
  file_uuid: string;
  storage_uri: string;
  byte_count: number;
  download_url: string;
}

export const exportLetterDocx = (
  slug: string,
  payload: { letter_type: string; title: string; draft_markdown: string },
) =>
  apiFetch(`${API}/matters/${slug}/letters/draft/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => jsonOrThrow<GeneratedDocxResponse>(r));

export const exportPreMotionDocx = (slug: string, result: PreMotionRunResult) =>
  apiFetch(`${API}/matters/${slug}/pre-motion/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).then((r) => jsonOrThrow<GeneratedDocxResponse>(r));

export async function downloadGeneratedDocx(fileUuid: string): Promise<Blob> {
  const resp = await apiFetch(`${API}/documents/generated/${fileUuid}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  return resp.blob();
}

// ----- Tracked changes accept/reject (Phase B W2) -----------------------

export interface EditResolutionResponse {
  edit: DocumentEditRead;
  new_version: DocumentVersionRead | null;
  resolved_text: string | null;
}

export interface BulkResolutionResponse {
  affected_count: number;
  new_version: DocumentVersionRead;
  resolved_text: string;
}

export interface DocumentVersionSummary {
  version: DocumentVersionRead;
  pending_count: number;
  accepted_count: number;
  rejected_count: number;
}

export class ConflictError extends Error {
  status = 409;
}

async function resolutionJsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 409) {
    const text = await res.text();
    throw new ConflictError(text || "edit already resolved");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const acceptEdit = (editId: string) =>
  apiFetch(`${API}/documents/edits/${editId}/accept`, { method: "POST" }).then(
    (r) => resolutionJsonOrThrow<EditResolutionResponse>(r),
  );

export const rejectEdit = (editId: string) =>
  apiFetch(`${API}/documents/edits/${editId}/reject`, { method: "POST" }).then(
    (r) => resolutionJsonOrThrow<EditResolutionResponse>(r),
  );

export const acceptAll = (versionId: string) =>
  apiFetch(`${API}/documents/versions/${versionId}/accept-all`, {
    method: "POST",
  }).then((r) => resolutionJsonOrThrow<BulkResolutionResponse>(r));

export const rejectAll = (versionId: string) =>
  apiFetch(`${API}/documents/versions/${versionId}/reject-all`, {
    method: "POST",
  }).then((r) => resolutionJsonOrThrow<BulkResolutionResponse>(r));

export const getDocumentVersions = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/versions`).then((r) =>
    resolutionJsonOrThrow<DocumentVersionSummary[]>(r),
  );

// ----- Auth + user --------------------------------------------------------

// Auth endpoints sit at the backend origin, NOT under /api. See main.py:
//   app.include_router(auth_router, prefix="/auth", ...)
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

export const signup = (email: string, password: string, name: string = "") =>
  apiFetch(`${AUTH}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
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

// ----- Settings: API keys ------------------------------------------------

export interface UserApiKeyRead {
  provider: string;
  last_used_at: string | null;
  created_at: string;
}

export const listApiKeys = () =>
  apiFetch(`${API}/settings/keys`).then((r) => jsonOrThrow<UserApiKeyRead[]>(r));

export const upsertApiKey = (provider: "anthropic" | "openai", apiKey: string) =>
  apiFetch(`${API}/settings/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, api_key: apiKey }),
  }).then((r) => jsonOrThrow<UserApiKeyRead>(r));

export const deleteApiKey = (provider: string) =>
  apiFetch(`${API}/settings/keys/${encodeURIComponent(provider)}`, {
    method: "DELETE",
  }).then(async (r) => {
    if (!r.ok && r.status !== 204) {
      const text = await r.text();
      throw new Error(`${r.status} ${r.statusText}: ${text}`);
    }
  });

// ----- Installed-skill catalogue extensions (Phase D W1) -----------------

export interface BrokenManifest {
  plugin: string;
  skill: string;
  errors: { path: string; message: string }[];
}

export const disableSkill = (plugin: string, skill: string) =>
  apiFetch(
    `${API}/workspace/skills/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}/disable`,
    { method: "POST" },
  ).then((r) => jsonOrThrow<{ plugin: string; skill: string; enabled: boolean }>(r));

export const enableSkill = (plugin: string, skill: string) =>
  apiFetch(
    `${API}/workspace/skills/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}/enable`,
    { method: "POST" },
  ).then((r) => jsonOrThrow<{ plugin: string; skill: string; enabled: boolean }>(r));

// ----- Anonymisation (folded from modules/anonymisation/api.ts) ----------

export type AnonymisationEngine = "presidio" | "claude" | "auto";

export interface AnonymiseRequestPayload {
  engine?: AnonymisationEngine;
  entity_types?: string[] | null;
  threshold?: number;
}

export interface TokenMapping {
  token: string;
  entity_type: string;
  original: string;
  occurrences: number;
}

export interface AnonymisationResult {
  document_id: string;
  redacted_text: string;
  engine: string;
  anonymised_at: string;
  char_count: number;
  entity_count: number;
  tokens: TokenMapping[];
}

export interface AnonymisationSpan {
  start: number;
  end: number;
  token: string;
  original: string;
  entity_type: string;
}

export interface MappingRead {
  document_id: string;
  tokens: TokenMapping[];
  spans: AnonymisationSpan[];
}

async function anonymisationJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`.trim());
  }
  return (await res.json()) as T;
}

export const anonymiseDocument = (
  documentId: string,
  body: AnonymiseRequestPayload = {},
): Promise<AnonymisationResult> =>
  apiFetch(`${API}/documents/${documentId}/anonymise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engine: "auto", threshold: 0.4, ...body }),
  }).then((r) => anonymisationJsonOrThrow<AnonymisationResult>(r));

export const getAnonymisation = (documentId: string): Promise<AnonymisationResult> =>
  apiFetch(`${API}/documents/${documentId}/anonymise`).then((r) =>
    anonymisationJsonOrThrow<AnonymisationResult>(r),
  );

export const getAnonymisationMapping = (documentId: string): Promise<MappingRead> =>
  apiFetch(`${API}/documents/${documentId}/anonymise/mapping`).then((r) =>
    anonymisationJsonOrThrow<MappingRead>(r),
  );

export const deleteAnonymisation = async (documentId: string): Promise<void> => {
  const res = await apiFetch(`${API}/documents/${documentId}/anonymise`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
};

// ----- Tabular review (folded from modules/tabular_review/api.ts) --------

export type ColumnType = "text" | "date" | "yesno" | "number";

export interface ColumnSpec {
  key: string;
  label: string;
  prompt: string;
  type: ColumnType;
}

export interface ReviewRowRead {
  document_id: string;
  document_filename: string;
  extracted_values: Record<string, unknown>;
  last_run_at: string | null;
}

export interface ReviewRead {
  id: string;
  matter_slug: string;
  title: string;
  columns_config: ColumnSpec[];
  rows: ReviewRowRead[];
  created_at: string;
  updated_at: string;
}

export interface ReviewSummary {
  id: string;
  title: string;
  column_count: number;
  row_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewCreateRequest {
  title: string;
  columns_config: ColumnSpec[];
}

export interface ReviewUpdateRequest {
  title?: string;
  columns_config?: ColumnSpec[];
}

export interface RunRequest {
  document_ids?: string[];
  column_keys?: string[];
  confirm_above_50?: boolean;
}

export interface RunEstimate {
  total_calls: number;
  est_input_tokens: number;
  est_output_tokens: number;
  est_cost_pence_lower: number;
  est_cost_pence_upper: number;
  requires_confirm: boolean;
  provider: string | null;
  model_id: string | null;
}

export interface RunErrorRow {
  document_id: string;
  column_key: string;
  error_message: string;
}

export interface RunReport {
  cells_run: number;
  cells_failed: number;
  errors: RunErrorRow[];
  duration_ms: number;
}

export interface ExportResponse {
  file_uuid: string;
  download_url: string;
  byte_count: number;
}

const reviewsBase = (slug: string) => `${API}/matters/${slug}/reviews`;

export const listReviews = (slug: string) =>
  apiFetch(reviewsBase(slug)).then((r) => jsonOrThrow<ReviewSummary[]>(r));

export const createReview = (slug: string, body: ReviewCreateRequest) =>
  apiFetch(reviewsBase(slug), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<ReviewRead>(r));

export const getReview = (slug: string, reviewId: string) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}`).then((r) => jsonOrThrow<ReviewRead>(r));

export const updateReview = (
  slug: string,
  reviewId: string,
  body: ReviewUpdateRequest,
) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<ReviewRead>(r));

export const deleteReview = (slug: string, reviewId: string) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}`, { method: "DELETE" }).then((r) => {
    if (!r.ok && r.status !== 204) {
      throw new Error(`${r.status} ${r.statusText}`);
    }
  });

export const estimateReview = (slug: string, reviewId: string, body: RunRequest = {}) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<RunEstimate>(r));

export const runReview = (slug: string, reviewId: string, body: RunRequest) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<RunReport>(r));

export const exportReviewDocx = (slug: string, reviewId: string) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}/export.docx`, {
    method: "POST",
  }).then((r) => jsonOrThrow<ExportResponse>(r));

// Backend-relative URL → fully qualified download URL.
export const generatedDocxUrl = (downloadUrl: string) =>
  `${BACKEND_ROOT}${downloadUrl}`;

// ----- Case law (folded from modules/case_law/api.ts) --------------------

export interface CaseLawSearchRequest {
  query: string;
  court?: string | null;
  year?: number | null;
}

export interface CaseLawResult {
  case_name: string;
  citation_ref: string;
  court: string | null;
  judgment_date: string | null;
  parties: string | null;
  summary: string | null;
  source_url: string | null;
  relevance_score: number | null;
}

export interface CaseLawSearchResponse {
  query: string;
  results: CaseLawResult[];
  truncated: boolean;
  raw_response_excerpt: string | null;
  model_used: string;
  latency_ms: number;
}

export interface CitationCreateRequest {
  case_name: string;
  citation_ref: string;
  citation_text: string;
  source_url?: string | null;
}

export interface MatterCitationRead {
  id: string;
  matter_id: string;
  case_name: string | null;
  citation_ref: string | null;
  citation_text: string;
  source_url: string | null;
  added_by_id: string;
  added_at: string;
}

const caseLawBase = (slug: string) => `${API}/matters/${slug}`;

export const searchCaseLaw = (slug: string, body: CaseLawSearchRequest) =>
  apiFetch(`${caseLawBase(slug)}/case-law/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<CaseLawSearchResponse>(r));

export const createCitation = (slug: string, body: CitationCreateRequest) =>
  apiFetch(`${caseLawBase(slug)}/citations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<MatterCitationRead>(r));

export const listCitations = (slug: string) =>
  apiFetch(`${caseLawBase(slug)}/citations`).then((r) =>
    jsonOrThrow<MatterCitationRead[]>(r),
  );

// ----- Assistant ----------------------------------------------------------

export interface SuggestedAction {
  type: "run_pre_motion" | "draft_letter" | "review_contract"
      | "view_document" | "view_audit" | "view_chronology"
      | "anonymise_document";
  label: string;
  params: Record<string, string>;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions: SuggestedAction[];
  created_at: string;
}

export const listAssistantMessages = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`)
    .then((r) => jsonOrThrow<AssistantMessage[]>(r));

export const postAssistantMessage = (slug: string, body: { content: string; selected_document_ids?: string[] }) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<{ user: AssistantMessage; assistant: AssistantMessage }>(r));

export const deleteCitation = (slug: string, citationId: string) =>
  apiFetch(`${caseLawBase(slug)}/citations/${citationId}`, { method: "DELETE" }).then(
    (r) => {
      if (!r.ok && r.status !== 204) {
        throw new Error(`${r.status} ${r.statusText}`);
      }
    },
  );

// ----- Contract Review (folded from modules/contract_review/api.ts) ------

export type Posture = "buyer" | "seller" | "balanced";
export type ContractKind =
  | "nda"
  | "saas"
  | "msa"
  | "dpa"
  | "consultancy"
  | "employment"
  | "settlement"
  | "other";

export interface ContractReviewInputs {
  document_id: string;
  posture?: Posture;
  contract_type?: ContractKind;
  counterparty_name?: string | null;
  deal_value?: string | null;
}

export type ClauseType =
  | "definitions"
  | "scope"
  | "term"
  | "payment"
  | "ip"
  | "confidentiality"
  | "data_protection"
  | "warranties"
  | "indemnity"
  | "liability"
  | "termination"
  | "governing_law"
  | "jurisdiction"
  | "arbitration"
  | "boilerplate"
  | "other";

export interface Clause {
  id: string;
  section: string;
  title: string;
  type: ClauseType;
  text: string;
  defined_terms_used: string[];
  cross_references: string[];
}

export interface ParsedContract {
  title: string;
  parties: string[];
  document_type: ContractKind;
  governing_law_stated: string | null;
  clauses: Clause[];
}

export type UkIssueCategory =
  | "ucta_s2_s3"
  | "cra_s62"
  | "uk_gdpr_art28"
  | "governing_law"
  | "jurisdiction"
  | "arbitration"
  | "liability_cap"
  | "indemnity"
  | "ip_assignment"
  | "termination"
  | "boilerplate"
  | "other";

export type RiskSeverity = "high" | "medium" | "low";

export interface UkIssue {
  category: UkIssueCategory;
  statute_ref: string;
  description: string;
  severity: RiskSeverity;
}

export interface ClauseAnalysis {
  clause_id: string;
  risk_score: number;
  summary: string;
  uk_issues: UkIssue[];
  posture_note: string;
}

export type RedlinePriority = "must" | "suggested" | "nice_to_have";

export interface Redline {
  clause_id: string;
  original_text: string;
  suggested_text: string;
  explanation: string;
  priority: RedlinePriority;
}

export interface ContractSummary {
  executive_summary: string;
  key_terms: string[];
  risk_overview: string;
  uk_specific_callouts: string[];
  recommendation: string;
}

export type StageState = "pending" | "running" | "done" | "error" | "skipped";

export interface StageStatus {
  name: string;
  status: StageState;
  sub_agent_count: number;
  duration_ms: number;
  token_count: number;
  errors: string[];
}

export interface ContractReviewResult {
  matter_slug: string;
  document_id: string;
  document_filename: string;
  started_at: string;
  completed_at: string;
  total_duration_ms: number;
  total_token_count: number;
  model_used: string;
  stages: StageStatus[];
  parsed: ParsedContract;
  analyses: ClauseAnalysis[];
  redlines: Redline[];
  summary: ContractSummary;
  posture: Posture;
  contract_type: ContractKind;
}

export const runContractReview = (
  slug: string,
  inputs: ContractReviewInputs,
): Promise<ContractReviewResult> =>
  apiFetch(`${API}/matters/${slug}/contract-review/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  }).then((r) => jsonOrThrow<ContractReviewResult>(r));

export type ContractReviewStreamEvent =
  | { event: "stage.start"; data: { stage: string } }
  | {
      event: "stage.end";
      data: {
        stage: string;
        duration_ms: number;
        token_count: number;
        status: "ok" | "error" | "skipped";
        error?: string;
      };
    }
  | { event: "result"; data: ContractReviewResult }
  | {
      event: "error";
      data: {
        message: string;
        code?: number;
        error?: string;
        provider?: string;
      };
    };

export class StreamPreflightError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function* runContractReviewStream(
  slug: string,
  inputs: ContractReviewInputs,
  signal?: AbortSignal,
): AsyncIterableIterator<ContractReviewStreamEvent> {
  const resp = await apiFetch(
    `${API}/matters/${slug}/contract-review/run-stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
      signal,
    },
  );
  if (!resp.ok || !resp.body) {
    const text = await resp.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* leave as text */
    }
    if (resp.status === 422) {
      const pk = providerKeyMissingFromBody(parsed);
      if (pk) throw pk;
    }
    if (resp.status === 502) {
      const upstream = tryParseProviderUpstream(parsed);
      if (upstream) throw upstream;
    }
    let message = `${resp.status} ${resp.statusText}`;
    if (parsed && typeof parsed === "object") {
      const detail = (parsed as { detail?: unknown }).detail;
      if (typeof detail === "string") message = detail;
      else if (detail && typeof detail === "object") {
        const m = (detail as { message?: unknown }).message;
        if (typeof m === "string") message = m;
      }
    } else if (typeof parsed === "string" && parsed) {
      message = parsed;
    }
    throw new StreamPreflightError(resp.status, parsed, message);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:"))
          dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = JSON.parse(dataLines.join("\n"));
      yield { event, data } as ContractReviewStreamEvent;
    }
  }
}

export interface DocxExportResult {
  file_uuid: string;
  storage_uri: string;
  byte_count: number;
  download_url: string;
}

export const exportContractReviewDocx = (
  slug: string,
  result: ContractReviewResult,
): Promise<DocxExportResult> =>
  apiFetch(`${API}/matters/${slug}/contract-review/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).then((r) => jsonOrThrow<DocxExportResult>(r));

// Public module submission flow (Phase D W3). The submitter never
// supplies frontmatter — the backend synthesises the SKILL.md
// authoritatively via `frontmatter.dump`. Frontend preview is a UX
// aid, not a wire contract.
export const SUBMISSION_TRUST_POSTURES = [
  "trusted",
  "third_party",
  "experimental",
] as const;
export type SubmissionTrustPosture = (typeof SUBMISSION_TRUST_POSTURES)[number];

// Closed capability set — mirrors backend `ALLOWED_CAPABILITIES`
// and schemas/module.json. Keep in sync.
export const SUBMISSION_CAPABILITIES = [
  "matter.read",
  "document.body.read",
  "document.generated.write",
  "model.invoke",
  "chronology.read",
  "chronology.write",
  "citation.write",
  "audit.emit",
] as const;
export type SubmissionCapability = (typeof SUBMISSION_CAPABILITIES)[number];

export interface ModuleSubmissionRequest {
  plugin_name: string;
  skill_name: string;
  description: string;
  body_markdown: string;
  capabilities: SubmissionCapability[];
  trust_posture: SubmissionTrustPosture;
  submitter_handle: string;
  submitter_contact: string;
  turnstile_token: string;
}

export interface ModuleSubmissionResponse {
  submission_id: string;
  pull_request_url: string;
  branch_name: string;
}

export interface SubmissionConfig {
  submission_enabled: boolean;
  turnstile_site_key: string | null;
}

export const getSubmissionConfig = () =>
  apiFetch(`${API}/modules/submissions/config`).then((r) =>
    jsonOrThrow<SubmissionConfig>(r),
  );

// `submitModule` returns the parsed body on success and throws an
// `Error` whose `.message` carries the JSON error envelope from the
// backend on failure so the UI can branch on status.
export async function submitModule(
  body: ModuleSubmissionRequest,
): Promise<ModuleSubmissionResponse> {
  const res = await apiFetch(`${API}/modules/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const err = new Error(`submission failed (${res.status})`);
    (err as Error & { status?: number; detail?: unknown }).status = res.status;
    (err as Error & { status?: number; detail?: unknown }).detail = detail;
    throw err;
  }
  return (await res.json()) as ModuleSubmissionResponse;
}
