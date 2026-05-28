import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `/auth` is shared between fastapi-users backend endpoints
// (POST /auth/register, POST /auth/login, GET /auth/users/me, ...) and
// frontend ROUTES (/auth/signin, /auth/signup, /auth/verify).
//
// A blanket `"/auth": http://backend:8000` proxy catches the frontend
// route GETs too — Vite then forwards them to FastAPI, which has no GET
// handler at /auth/signin, returns 404, and the SPA never paints.
//
// CI works because PR #10's `serve-e2e-preview.mjs` does the right thing
// for the built bundle. Local `vite dev` needs the same treatment: only
// proxy requests the backend should actually handle (non-HTML), and let
// the SPA serve cold-loads of frontend routes.
//
// `proxyHtmlBypass` returns the original URL when the request is an HTML
// navigation; Vite then serves index.html and React Router takes over
// client-side. Form POSTs, fetch(), and JSON API calls fall through to
// the proxy as normal.
export function proxyHtmlBypass(req: {
  method?: string;
  url?: string;
  headers: { accept?: string };
}): string | undefined {
  if (
    req.method === "GET" &&
    typeof req.headers.accept === "string" &&
    req.headers.accept.includes("text/html")
  ) {
    return req.url;
  }
  return undefined;
}

const spaAwareBackendProxy = {
  target: "http://backend:8000",
  changeOrigin: true,
  bypass: proxyHtmlBypass,
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": "http://backend:8000",
      "/auth": spaAwareBackendProxy,
      "/health": "http://backend:8000",
    },
  },
});
