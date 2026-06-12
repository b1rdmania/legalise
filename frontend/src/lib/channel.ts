/**
 * Launch channel tag capture (Gate 4).
 *
 * Tagged launch URLs carry `?c=hn|li|x|conf` (documented in
 * docs/OPERATIONS.md §Launch instrumentation). The tag is remembered in
 * sessionStorage so it survives the landing → signup navigation, then
 * sent with the register payload. Allowlisted; anything else is ignored.
 * Session-scoped on purpose — this is a launch-attribution breadcrumb,
 * not a tracking cookie.
 */

const CHANNELS = new Set(["hn", "li", "x", "conf"]);

const STORAGE_KEY = "legalise.signup_channel";

/** Read ?c= from the current URL and remember a valid tag. Call once at boot. */
export function captureChannelFromUrl(): void {
  try {
    const c = new URLSearchParams(globalThis.location?.search ?? "").get("c");
    if (c && CHANNELS.has(c.toLowerCase())) {
      globalThis.sessionStorage?.setItem(STORAGE_KEY, c.toLowerCase());
    }
  } catch {
    // Storage unavailable (private mode etc.) — attribution is best-effort.
  }
}

/** The remembered channel tag, or null. */
export function getSignupChannel(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
