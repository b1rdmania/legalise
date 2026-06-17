import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { navigate } from "../lib/route";
import { getSignupChannel } from "../lib/channel";
import { useAuth } from "./AuthProvider";
import { AuthCard, LedgerField } from "./AuthCard";
import { ErrorCallout, inputCls, primaryBtn } from "../ui/primitives";

// Gate 4 demand capture — optional, self-reported. Mirrors the backend
// allowlist in app/core/demand_capture.py.
const PERSONA_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Prefer not to say" },
  { value: "practising_solicitor", label: "Practising solicitor" },
  { value: "in_house", label: "In-house counsel" },
  { value: "legal_ops", label: "Legal ops" },
  { value: "engineer", label: "Engineer" },
  { value: "other", label: "Other" },
];

export function SignUp() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [persona, setPersona] = useState("");
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
      await auth.signUp(email, password, name, {
        persona: persona || null,
        channel: getSignupChannel(),
      });
      // After register, backend may require verification - route to pending.
      navigate("/auth/verify-pending");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      heading="Sign up"
      intro="Create a workspace. You add your own Anthropic key after you verify your email."
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <LedgerField label="Name" hint="optional — shown in audit rows">
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        <LedgerField label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        <LedgerField label="Password" hint="at least 8 characters">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            className={inputCls}
          />
        </LedgerField>
        <LedgerField label="I am a" hint="optional — helps us understand who's evaluating">
          <select
            value={persona}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setPersona(e.target.value)}
            className={inputCls}
          >
            {PERSONA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </LedgerField>
        {error && <ErrorCallout message={error} />}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-muted mt-4">
        Already have an account?{" "}
        <a href="/auth/signin" className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal">
          Sign in
        </a>
        .
      </p>
    </AuthCard>
  );
}
