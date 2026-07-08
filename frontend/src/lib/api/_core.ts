// Shared API foundation: origin constants, fetch wrapper, error envelopes.
//
// Domain-specific API modules (auth, matters, signoffs, modules, ...) import
// from here so they do not pull each other in. The main `lib/api.ts` barrel
// re-exports every symbol so existing `../lib/api` import paths keep working
// unchanged.

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

// Generic ok/throw helper used by every non-auth endpoint. 422 bodies are
// inspected for the provider_key_missing envelope; 502 bodies for the
// provider_upstream envelope. Other non-2xx responses throw a plain Error.
export async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 422) {
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

// Human-readable provider name for UI copy. Covers the brand spellings
// naive capitalisation gets wrong (OpenAI, OpenRouter).
export function providerLabel(provider: string): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "openrouter") return "OpenRouter";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

// Translate a `ProviderUpstreamError` code into a human readable banner
// string. `{provider}` is substituted with the actual provider name so
// the same map serves Anthropic, OpenAI, OpenRouter, and Ollama.
export function providerUpstreamMessage(err: ProviderUpstreamError): string {
  const provider = providerLabel(err.provider);
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
// (Cookie/CORS coherence invariant). All app fetches route through
// `apiFetch`; `credentials: "include"` is spread last so a caller-supplied
// `init` cannot accidentally drop or downgrade it.
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}
