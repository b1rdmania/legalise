/**
 * Phase 14 A0 — App entry.
 *
 * Pre-A0 this file owned the shell layout and a giant switch over the
 * hash-router's Route discriminated union. Both moved out:
 *   - chrome (TopBar / Drawer / `<Outlet />`) lives in `app/AppShell.tsx`
 *   - per-page rendering is now TanStack Router (`src/router/index.tsx`)
 *
 * App is now just the auth wrapper + RouterProvider.
 */

import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "../auth/AuthProvider";
import { router } from "../router";

// Khan v Acme slug from backend/app/core/seed.py. Kept for backwards
// compatibility — some shipped marketing copy + emails reference it.
const DEMO_SLUG = "khan-v-acme-trading-2026";
export const DEMO_HREF_AUTHED = `/matters/${DEMO_SLUG}`;

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
