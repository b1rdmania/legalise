// User settings: provider API keys.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";

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
