import { useEffect, useState } from "react";
import { verifyEmail } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { ErrorCallout, LoadingLine, primaryBtn } from "../ui/primitives";

export function Verify({ token }: { token: string | null }) {
  // Destructure refresh so the effect depends on a stable useCallback ref,
  // not the whole auth object (which changes identity on every refresh and
  // would otherwise re-submit the one-time token).
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing verification token. Use the link from your email.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await verifyEmail(token);
        if (!cancelled) {
          setStatus("ok");
          await refresh();
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          // fastapi-users returns VERIFY_USER_BAD_TOKEN for an expired,
          // already-used, or malformed token — the common case. Show a
          // human message, not the raw JSON envelope.
          const msg = String(err);
          setError(
            /BAD_TOKEN|ALREADY_VERIFIED|400/i.test(msg)
              ? "This link has expired or has already been used. Request a fresh one below."
              : msg,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  if (status === "pending") {
    return (
      <AuthCard eyebrow="Before the registrar" heading="Verifying…">
        <LoadingLine label="checking your token" />
      </AuthCard>
    );
  }

  if (status === "ok") {
    return (
      <AuthCard
        heading="Email verified"
        intro="Your account is active. Open your workspace to get started."
      >
        <a href="/matters" className={primaryBtn + " inline-block"}>
          Open workspace
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow="Before the registrar" heading="Verification failed">
      {error && <ErrorCallout message={error} />}
      <p className="text-sm text-muted mt-6">
        <a href="/auth/verify-pending" className="hover:text-seal underline">
          Request a new link
        </a>
      </p>
    </AuthCard>
  );
}
