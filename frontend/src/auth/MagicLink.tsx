import { useEffect, useState } from "react";
import { verifyMagicLink } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { ErrorCallout, LoadingLine, primaryBtn } from "../ui/primitives";

/**
 * Lands from a magic-link email (`?token=...`). Unlike Verify.tsx (which
 * only marks an account verified), a successful magic-link check both
 * proves email ownership and logs in — creating the account first if the
 * email is new. See ADR-012.
 */
export function MagicLink({ token }: { token: string | null }) {
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing sign-in link. Use the link from your email.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await verifyMagicLink(token);
        if (!cancelled) {
          setStatus("ok");
          await refresh();
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          const msg = String(err);
          setError(
            /MAGIC_LINK_INVALID_OR_EXPIRED|400/i.test(msg)
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
      <AuthCard eyebrow="The workspace" heading="Signing you in…">
        <LoadingLine label="checking your link" />
      </AuthCard>
    );
  }

  if (status === "ok") {
    return (
      <AuthCard heading="You're in" intro="Open your workspace to get started.">
        <a href="/matters" className={primaryBtn + " inline-block"}>
          Open workspace
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow="The workspace" heading="Sign-in failed">
      {error && <ErrorCallout message={error} />}
      <p className="text-sm text-muted mt-6">
        <a href="/auth/login" className="hover:text-seal underline">
          Back to sign in
        </a>
      </p>
    </AuthCard>
  );
}
