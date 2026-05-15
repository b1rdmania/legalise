import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { navigate } from "../lib/route";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { ErrorCallout, Field, inputCls, primaryBtn } from "../ui/primitives";

export function SignUp() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.user) navigate("/matters");
  }, [auth.user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signUp(email, password, name);
      // After register, backend may require verification — route to pending.
      navigate("/auth/verify-pending");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="AUTH — SIGN UP"
      heading="Sign up"
      intro="Create a workspace. You'll add an Anthropic or OpenAI key after email verification."
    >
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <Field label="Name" hint="optional — shown in audit rows">
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>
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
        <Field label="Password" hint="at least 8 characters">
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
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-muted mt-6">
        Already have an account?{" "}
        <a href="#/auth/signin" className="text-ink hover:text-muted underline">
          Sign in
        </a>
        .
      </p>
    </AuthCard>
  );
}
