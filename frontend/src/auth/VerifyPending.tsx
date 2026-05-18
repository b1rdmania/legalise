import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { requestVerifyToken } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { ErrorCallout, Field, inputCls, primaryBtn } from "../ui/primitives";

export function VerifyPending() {
  const auth = useAuth();
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resend = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await requestVerifyToken(email);
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="AUTH - VERIFY EMAIL"
      heading="Check your inbox"
      intro="We sent a verification link to your email. Click it to activate your account."
    >
      {sent ? (
        <p className="prose-p mb-0">A new link is on its way.</p>
      ) : (
        <form className="flex flex-col gap-6" onSubmit={resend}>
          <Field label="Email" hint="resend the link if needed">
            <input
              type="email"
              required
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              className={inputCls}
            />
          </Field>
          {error && <ErrorCallout message={error} />}
          <button type="submit" disabled={busy || !email} className={primaryBtn}>
            {busy ? "Sending…" : "Resend link"}
          </button>
        </form>
      )}
      <p className="text-sm text-muted mt-6">
        <a href="#/auth/signin" className="hover:text-ink underline">
          Back to sign in
        </a>
      </p>
    </AuthCard>
  );
}
