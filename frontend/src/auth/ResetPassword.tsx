import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { resetPassword } from "../lib/api";
import { AuthCard } from "./AuthCard";
import { ErrorCallout, Field, inputCls, primaryBtn } from "../ui/primitives";

export function ResetPassword({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Missing reset token. Use the link from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthCard
        eyebrow="AUTH - RESET PASSWORD"
        heading="Missing token"
        intro="This page expects a one-time token from the reset email link."
      >
        <a href="/auth/forgot" className="text-sm text-muted hover:text-ink">
          Request a new reset link
        </a>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        eyebrow="AUTH - RESET PASSWORD"
        heading="Password updated"
        intro="Your new password is set. Sign in to continue."
      >
        <a href="/auth/signin" className={primaryBtn + " inline-block"}>
          Sign in
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="AUTH - RESET PASSWORD"
      heading="Choose a new password"
      intro="At least 8 characters. The reset link expires soon, so finish here."
    >
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <Field label="New password">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            className={inputCls}
          />
        </Field>
        {error && <ErrorCallout message={error} />}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthCard>
  );
}
