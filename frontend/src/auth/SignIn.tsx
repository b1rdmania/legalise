import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { navigate } from "../lib/route";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { ErrorCallout, Field, inputCls, primaryBtn } from "../ui/primitives";

export function SignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If already authed, bounce to matters.
  useEffect(() => {
    if (auth.user) navigate("/matters");
  }, [auth.user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email, password);
      navigate("/matters");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard eyebrow="AUTH - SIGN IN" heading="Sign in" intro="Bring your own Anthropic or OpenAI key after signing in.">
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
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            className={inputCls}
          />
        </Field>
        {error && <ErrorCallout message={error} />}
        <div className="flex items-center justify-between gap-4">
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <a href="/auth/forgot" className="text-sm text-muted hover:text-ink">
            Forgot password?
          </a>
        </div>
      </form>
      <p className="text-sm text-muted mt-6">
        No account?{" "}
        <a href="/auth/signup" className="text-ink hover:text-muted underline">
          Sign up
        </a>
        .
      </p>
    </AuthCard>
  );
}
