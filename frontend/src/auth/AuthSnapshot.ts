/**
 * Module-level mirror of the AuthProvider state.
 *
 * TanStack Router's `beforeLoad` runs outside the React tree, so it cannot
 * read context via useAuth. AuthProvider writes its current snapshot here
 * on every state change, and router guards read it synchronously.
 *
 * This file is the only place outside React that reads / writes auth state.
 * Treat the snapshot as authoritative for routing decisions and the React
 * context as authoritative for components — they're kept in lockstep by
 * AuthProvider's effect.
 */

import type { CurrentUser } from "../lib/api";

export type AuthSnapshot = {
  user: CurrentUser | null;
  loading: boolean;
};

let _snapshot: AuthSnapshot = { user: null, loading: true };

export function setAuthSnapshot(next: AuthSnapshot): void {
  _snapshot = next;
}

export function getAuthSnapshot(): AuthSnapshot {
  return _snapshot;
}
