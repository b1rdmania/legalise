import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { forgotPassword } from "../lib/api";
import { AuthCard } from "./AuthCard";
import { ErrorCallout, Field, inputCls, primaryBtn } from "../ui/primitives";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthCard
        eyebrow="AUTH — FORGOT PASSWORD"
        heading="Check your email"
        intro="If an account exists for that address, a reset link is on its way."
      >
        <a href="#/auth/signin" className="text-sm text-muted hover:text-ink">
          Back to sign in
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="AUTH — FORGOT PASSWORD"
      heading="Reset your password"
      intro="Enter your account email. We'll send a one-time reset link."
    >
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        {error && <ErrorCallout message={error} />}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-sm text-muted mt-6">
        <a href="#/auth/signin" className="hover:text-ink underline">
          Back to sign in
        </a>
      </p>
    </AuthCard>
  );
}
