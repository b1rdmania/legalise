import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { navigate } from "../lib/route";
import { useAuth } from "./AuthProvider";
import { AuthCard, LedgerField } from "./AuthCard";
import { ErrorCallout, inputCls, primaryBtn } from "../ui/primitives";

/**
 * /auth/join — self-serve hosted registration. Creates the account
 * (POST /auth/register), which in production sends a verification email;
 * we route to /auth/verify-pending. In dev the backend auto-verifies, so
 * refresh() sets auth.user and the effect below bounces to /matters.
 */
export function Register() {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If already authed (or auto-verified in dev), bounce to matters.
  useEffect(() => {
    if (auth.user) navigate("/matters");
  }, [auth.user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.signUp(email, password, name);
      navigate("/auth/verify-pending");
    } catch (err) {
      const msg = String(err);
      if (/ALREADY_EXISTS/i.test(msg)) {
        setError("An account with that email already exists — sign in instead.");
      } else if (/PASSWORD/i.test(msg)) {
        setError("That password was rejected. Try a longer one.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="The workspace"
      heading="Create an account"
      intro="Evaluation access. Bring your own Anthropic / OpenAI key, or use the keyless demo model. Not for live client matters."
    >
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <LedgerField label="Name" htmlFor="reg-name">
          <input
            id="reg-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        <LedgerField label="Email" htmlFor="reg-email">
          <input
            id="reg-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        <LedgerField label="Password" hint="8+ characters" htmlFor="reg-password">
          <input
            id="reg-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        {error && <ErrorCallout message={error} />}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-muted mt-6">
        Already have an account?{" "}
        <a
          href="/auth/login"
          className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          Sign in
        </a>
        .
      </p>
      <p className="mt-4 border-t border-rule pt-4 text-xs text-muted">
        We&apos;ll email a link to confirm your address.
      </p>
    </AuthCard>
  );
}
