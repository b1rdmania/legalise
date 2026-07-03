// Module catalog, install ceremony, grants, invocations, and artifacts.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";

// ---------------------------------------------------------------------------
// v2 module catalog + trust ceremony
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

// Lawve Skill Importer v1 — browse external skills + convert to a
// governed module draft (read-only; never installs/executes scripts).
export interface LawveSkillRow {
  source: string;
  repo: string;
  ref: string | null;
  slug: string;
  name: string;
  description: string;
  version: string | null;
  author_name: string | null;
  license: string | null;
  source_path: string | null;
  /** Direct attribution link to the skill's lawve.ai directory page. */
  lawve_url?: string | null;
  has_references: boolean;
  has_scripts: boolean;
  script_review_required: boolean;
}
export interface LawveSkillDetail extends LawveSkillRow {
  skill_markdown: string;
  frontmatter: Record<string, unknown>;
  references: string[];
  scripts: string[];
  license_text: string | null;
  provenance: { repo_url: string; ref: string | null; source_path: string | null };
}
export interface LawveDraftWarning {
  code: string;
  message: string;
}
export interface LawveDraftResult {
  manifest: Record<string, unknown>;
  valid: boolean;
  errors: ManifestValidationError[];
  warnings: LawveDraftWarning[];
  source_provenance: { repo_url: string; ref: string | null; source_path: string | null } | null;
  next_steps: string[];
}

export const listLawveSkills = () =>
  apiFetch(`${API}/modules/external/lawve/skills`).then((r) =>
    jsonOrThrow<{ source: string; repo: string; ref: string | null; skills: LawveSkillRow[] }>(r),
  );

// The honest gap strip — how many skills the lawve.ai directory lists
// versus how many are importable here today. Public; cached 1h
// server-side; callers hide the strip on failure.
export interface LawveDirectoryCount {
  source: string;
  skills_url: string;
  count: number;
}
export const getLawveDirectoryCount = () =>
  apiFetch(`${API}/modules/external/lawve/directory-count`).then((r) =>
    jsonOrThrow<LawveDirectoryCount>(r),
  );

export const getLawveSkill = (slug: string) =>
  apiFetch(`${API}/modules/external/lawve/skills/${encodeURIComponent(slug)}`).then((r) =>
    jsonOrThrow<LawveSkillDetail>(r),
  );

export const draftLawveModule = (slug: string, overrides?: Record<string, unknown>) =>
  apiFetch(`${API}/modules/external/lawve/skills/${encodeURIComponent(slug)}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overrides ?? {}),
  }).then((r) => jsonOrThrow<LawveDraftResult>(r));

export const getGithubSkill = (url: string) =>
  apiFetch(`${API}/modules/external/github/skill?url=${encodeURIComponent(url)}`).then(
    (r) => jsonOrThrow<LawveSkillDetail>(r),
  );

export const draftGithubModule = (url: string, overrides?: Record<string, unknown>) =>
  apiFetch(`${API}/modules/external/github/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, ...(overrides ?? {}) }),
  }).then((r) => jsonOrThrow<LawveDraftResult>(r));

// Installed-modules listing. One row per module_id
// (most recent installed_at). Frontend uses it for the catalog
// badge and as one AND clause in GrantsPanel.runnablePairs.
export interface InstalledModule {
  module_id: string;
  name?: string | null;
  version: string;
  publisher: string;
  visibility: string;
  signature_status: string;
  capabilities?: unknown[];
  enabled: boolean;
  installed_at: string;
  installed_by_user_id: string | null;
  install_path?: string | null;
  track_record?: Record<string, number>;
  // Median review latency (seconds) over sign-offs with a derivable
  // review window (M13); null when none — render "—", never 0.
  track_median_review_seconds?: number | null;
  // How many decisions the median is over (sub-n=30 gets the honesty label).
  track_review_latency_n?: number;
}

export const listInstalledModules = () =>
  apiFetch(`${API}/modules/installed`).then((r) =>
    jsonOrThrow<InstalledModule[]>(r),
  );

// Skill requests. The audit chain is the store — POST writes one
// module.request.created row; GET (admin) derives the pending set
// from those rows minus module_ids already installed and enabled.
export interface ModuleRequestRow {
  module_id: string;
  source: string | null;
  /** Where the skill lives (e.g. the GitHub repo URL) — lets the admin
   * Review-&-add link resolve sources the importer can't look up by
   * slug. Optional: older rows won't carry it. */
  source_url?: string | null;
  requested_by: string | null;
  requested_at: string;
}

export const requestModule = (
  moduleId: string,
  source?: string,
  sourceUrl?: string,
) =>
  apiFetch(`${API}/modules/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      module_id: moduleId,
      source: source ?? null,
      source_url: sourceUrl ?? null,
    }),
  }).then((r) => jsonOrThrow<{ ok: boolean }>(r));

export const listModuleRequests = () =>
  apiFetch(`${API}/modules/requests`).then((r) =>
    jsonOrThrow<ModuleRequestRow[]>(r),
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
// Matter-scoped grants
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
 * grant creation. The endpoint returns:
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
        `Skill ${body.module_id} has not been added to this workspace.`,
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
// Invocation + artifacts
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

// ---------------------------------------------------------------------------
// Matter artifacts
// ---------------------------------------------------------------------------

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
