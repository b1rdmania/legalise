import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { navigate } from "../lib/route";
import { requestVerifyToken } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { AuthCard, LedgerField } from "./AuthCard";
import { MagicLinkForm } from "./MagicLinkForm";
import { OAuthButtons } from "./OAuthButtons";
import { ErrorCallout, inputCls, primaryBtn } from "../ui/primitives";

type ResendState = "idle" | "sending" | "sent" | "error";

export function SignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When login fails because the account isn't verified, offer a resend
  // instead of leaving the user stuck on a raw error. The backend
  // returns LOGIN_USER_NOT_VERIFIED in this case.
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resend, setResend] = useState<ResendState>("idle");

  // If already authed, bounce to matters.
  useEffect(() => {
    if (auth.user) navigate("/matters");
  }, [auth.user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsVerify(false);
    setResend("idle");
    try {
      await auth.signIn(email, password);
      navigate("/matters");
    } catch (err) {
      const msg = String(err);
      if (/NOT_VERIFIED/i.test(msg)) {
        // Don't dump the raw envelope; show the verify-resend affordance.
        setNeedsVerify(true);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setResend("sending");
    try {
      await requestVerifyToken(email);
      setResend("sent");
    } catch {
      setResend("error");
    }
  };

  return (
    <AuthCard eyebrow="The workspace" heading="Sign in" intro="Sign in to this Legalise deployment. Not for live client matters.">
      {/* The honest state: the hosted backend exists but isn't running.
          The form stays visible so the surface is real, and the note
          carries the pilot ask. */}
      <div className="mb-6 border border-rule bg-wash p-4 text-sm leading-relaxed">
        <p className="text-ink">
          <strong>The hosted backend is built, but switched off.</strong>{" "}
          Everything here runs self-hosted — clone the repo and you have the
          whole thing.
        </p>
        <p className="mt-2 text-prose">
          Want to run the hosted version as a pilot? It&apos;s functional but
          incomplete, and I&apos;d rather run it with a real firm than polish
          it in the dark.{" "}
          <a
            href="mailto:andrew@legalise.dev?subject=Legalise%20hosted%20pilot"
            className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            Drop me an email
          </a>
          .
        </p>
      </div>
      <OAuthButtons />
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <LedgerField label="Email" htmlFor="signin-email">
          <input
            id="signin-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        <LedgerField label="Password" htmlFor="signin-password">
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        {error && <ErrorCallout message={error} />}
        {needsVerify && (
          <div className="rounded-md border border-rule bg-wash p-4 text-sm">
            <p className="text-ink">
              This account hasn’t been verified yet. Check your inbox for
              the verification link, or resend it.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={resendVerification}
                disabled={resend === "sending" || resend === "sent" || !email}
                className="border border-rule px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-paper disabled:opacity-50"
              >
                {resend === "sending"
                  ? "Sending…"
                  : resend === "sent"
                    ? "Verification email sent"
                    : "Resend verification email"}
              </button>
              {resend === "sent" && (
                <span className="text-muted">Check your inbox and spam.</span>
              )}
              {resend === "error" && (
                <span className="text-seal">Couldn’t send — try again.</span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <a href="/auth/forgot" className="text-sm text-muted hover:text-seal">
            Forgot password?
          </a>
        </div>
      </form>
      <div className="mt-6">
        <MagicLinkForm />
      </div>
      <p className="text-sm text-muted mt-6">
        Need an account?{" "}
        <a href="/auth/join" className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal">
          Create one
        </a>
        . Prefer your own machine?{" "}
        <a href="/auth/signin" className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal">
          Run it yourself
        </a>
        .
      </p>
    </AuthCard>
  );
}
