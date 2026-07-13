import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { getSignInMethods, requestMagicLink } from "../lib/api";
import { LedgerField } from "./AuthCard";
import { ErrorCallout, inputCls, secondaryBtn } from "../ui/primitives";

/**
 * "Email me a link" — passwordless alternative on both SignIn and
 * Register. A magic link both proves ownership and logs in, creating
 * the account if the email is new (see ADR-012), so this one form
 * serves both screens identically.
 *
 * Off by default (MAGIC_LINK_ENABLED, same /auth/oauth/providers
 * endpoint OAuthButtons already reads) — unlike OAuth it needs no
 * external credentials to work, so it needs its own explicit switch
 * before it renders anywhere.
 */
export function MagicLinkForm() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getSignInMethods()
      .then((m) => {
        if (!cancelled) setEnabled(m.magic_link);
      })
      .catch(() => {
        // Nice-to-have — the password form still works if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted hover:text-seal underline underline-offset-4 decoration-rule"
      >
        Or email me a sign-in link
      </button>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await requestMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p className="prose-p mb-0 text-sm">
        Check your inbox for a sign-in link. It expires in 15 minutes and
        works once. Check spam if it doesn't arrive.
      </p>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <LedgerField label="Email" htmlFor="magic-link-email">
        <input
          id="magic-link-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          className={inputCls}
        />
      </LedgerField>
      {error && <ErrorCallout compact message={error} />}
      <button type="submit" disabled={busy || !email} className={secondaryBtn}>
        {busy ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
