export const HOSTED_ACCESS_MODE =
  (import.meta.env.VITE_HOSTED_ACCESS_MODE as "waitlist" | "open" | undefined) ??
  "waitlist";

export const HOSTED_ACCESS_WAITLIST = HOSTED_ACCESS_MODE === "waitlist";

export const WAITLIST_HREF = "/waitlist";

export const WAITLIST_EMAIL = "hello@legalise.dev";

export const WAITLIST_MAILTO =
  `mailto:${WAITLIST_EMAIL}?subject=${encodeURIComponent(
    "Legalise hosted evaluation access",
  )}`;
