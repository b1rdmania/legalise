import { vi } from "vitest";

/** Shared JSON response builder used by draft-sync and tracked-changes fetch mocks. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Shared per-test teardown. Call from each test file's own `afterEach`
 * (rather than registering the hook here) so hook ordering stays explicit
 * per file.
 */
export function resetDocumentEditorTestEnvironment(): void {
  vi.useRealTimers();
  window.localStorage.clear();
  vi.restoreAllMocks();
}
