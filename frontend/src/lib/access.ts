export const HOSTED_ACCESS_MODE =
  (import.meta.env.VITE_HOSTED_ACCESS_MODE as
    | "disabled"
    | "waitlist"
    | "open"
    | undefined) ??
  "open";

const HOSTED_ACCESS_HOST =
  (import.meta.env.VITE_HOSTED_ACCESS_HOST as string | undefined) ?? "legalise.dev";

const CURRENT_HOST =
  typeof globalThis.location === "undefined" ? "" : globalThis.location.hostname;

export const HOSTED_ACCESS_WAITLIST =
  HOSTED_ACCESS_MODE === "waitlist" && CURRENT_HOST === HOSTED_ACCESS_HOST;

export const HOSTED_ACCESS_DISABLED =
  HOSTED_ACCESS_MODE === "disabled" && CURRENT_HOST === HOSTED_ACCESS_HOST;

export const HOSTED_AUTH_HREF = HOSTED_ACCESS_DISABLED
  ? "/auth/signup"
  : HOSTED_ACCESS_WAITLIST
    ? "/waitlist"
    : "/auth/login";

export const WAITLIST_HREF = "/waitlist";

export const WAITLIST_EMAIL = "andrew@legalise.dev";

export const WAITLIST_MAILTO =
  `mailto:${WAITLIST_EMAIL}?subject=${encodeURIComponent(
    "Legalise hosted evaluation access",
  )}`;
