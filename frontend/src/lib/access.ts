export const HOSTED_ACCESS_MODE =
  (import.meta.env.VITE_HOSTED_ACCESS_MODE as "waitlist" | "open" | undefined) ??
  "open";

const HOSTED_ACCESS_HOST =
  (import.meta.env.VITE_HOSTED_ACCESS_HOST as string | undefined) ?? "legalise.dev";

const CURRENT_HOST =
  typeof globalThis.location === "undefined" ? "" : globalThis.location.hostname;

export const HOSTED_ACCESS_WAITLIST =
  HOSTED_ACCESS_MODE === "waitlist" && CURRENT_HOST === HOSTED_ACCESS_HOST;

export const WAITLIST_HREF = "/waitlist";

export const WAITLIST_EMAIL = "hello@legalise.dev";

export const WAITLIST_MAILTO =
  `mailto:${WAITLIST_EMAIL}?subject=${encodeURIComponent(
    "Legalise hosted evaluation access",
  )}`;
