import { useEffect, useState } from "react";
import { getSignInMethods, oauthAuthorizeUrl, type OAuthProviders } from "../lib/api";
import { ErrorCallout, secondaryBtn } from "../ui/primitives";

// Microsoft first, not Google — Entra/Azure AD is the more relevant
// identity provider for the UK law firm audience this app is built for
// (most run Microsoft 365, not Google Workspace).
const PROVIDER_ORDER: Array<{ key: keyof OAuthProviders; label: string }> = [
  { key: "microsoft", label: "Microsoft" },
  { key: "google", label: "Google" },
  { key: "github", label: "GitHub" },
];

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  provider_denied: "Sign-in was cancelled.",
  invalid_state: "That sign-in link expired — try again.",
  no_email: "That account has no public, verified email to sign in with. Try a different method.",
  already_exists: "An account already exists for that email via a different sign-in method.",
  inactive: "This account is deactivated.",
  internal_error: "Something went wrong. Try again, or use email instead.",
};

/**
 * Shared OAuth button row for SignIn and Register — first use creates
 * the account, return use logs in, same buttons either way. See
 * ADR-012. Plain <a href> links: OAuth is a full-page browser redirect
 * (only the backend holds the provider client secret), not a fetch call.
 */
export function OAuthButtons() {
  const [providers, setProviders] = useState<OAuthProviders | null>(null);
  const [oauthError] = useState<string | null>(() =>
    new URLSearchParams(globalThis.location?.search ?? "").get("oauth_error"),
  );

  useEffect(() => {
    let cancelled = false;
    void getSignInMethods()
      .then((p) => {
        if (!cancelled) setProviders(p);
      })
      .catch(() => {
        // Provider list is a nice-to-have, not load-bearing — the
        // password form still works if this fails. Fail silent.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabled = PROVIDER_ORDER.filter((p) => providers?.[p.key]);

  if (!oauthError && enabled.length === 0) return null;

  return (
    <div className="mb-6">
      {oauthError && (
        <ErrorCallout
          compact
          message={OAUTH_ERROR_MESSAGES[oauthError] ?? "Sign-in failed. Try again."}
        />
      )}
      {enabled.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {enabled.map((p) => (
              <a key={p.key} href={oauthAuthorizeUrl(p.key)} className={secondaryBtn}>
                Continue with {p.label}
              </a>
            ))}
          </div>
          <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-[0.18em] text-muted">
            <span className="h-px flex-1 bg-rule" />
            or
            <span className="h-px flex-1 bg-rule" />
          </div>
        </>
      )}
    </div>
  );
}
