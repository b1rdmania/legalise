import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  AccountHasMattersError,
  deleteAccount,
  deleteApiKey,
  listApiKeys,
  listModels,
  updateProfile,
  upsertApiKey,
  type CurrentUser,
  type ModelOption,
  type UserApiKeyRead,
} from "../lib/api";
import { navigate } from "../lib/route";
import { useAuth } from "./AuthProvider";
import {
  ErrorCallout,
  Field,
  LoadingLine,
  PageHeader,
  inputCls,
  primaryBtn,
} from "../ui/primitives";
import { SectionRule } from "../ui/certificate";

export type SettingsTab = "profile" | "keys" | "preferences";

export function Settings({ tab }: { tab: SettingsTab }) {
  const auth = useAuth();

  // Protect: bounce to signin if unauthenticated (after loading completes).
  useEffect(() => {
    if (!auth.loading && !auth.user) navigate("/auth/signin");
  }, [auth.loading, auth.user]);

  if (auth.loading || !auth.user) {
    return (
      <div className="page-shell">
        <LoadingLine label="loading account" />
      </div>
    );
  }

  // Preferences is an empty v0.2 placeholder — the route still resolves
  // (deep links don't 404) but it's hidden from nav until it has a real
  // setting, so the product doesn't read as unfinished.
  const sidebarItems: { key: SettingsTab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "keys", label: "Provider keys" },
  ];

  return (
    <div className="page-shell">
      <PageHeader
        display
        title="Settings"
        whisper="Your account at the registry"
        description="The account holds your profile, your provider keys, and your defaults. Your name appears in audit rows; key changes are themselves recorded."
      />
      <div className="flex flex-col lg:flex-row gap-10">
        <aside className="lg:w-64 shrink-0 lg:border-r lg:border-rule lg:pr-6">
          <nav className="flex lg:flex-col gap-1 border-b lg:border-b-0 border-rule lg:border-0">
            {sidebarItems.map((item) => (
              <a
                key={item.key}
                href={`/settings/${item.key}`}
                className={
                  "py-2 lg:py-2 px-3 lg:px-4 text-[10px] uppercase tracking-[0.18em] transition-colors lg:border-l-2 -mb-px lg:-ml-px " +
                  (tab === item.key
                    ? "text-ink lg:border-ink lg:bg-wash"
                    : "text-muted hover:text-ink lg:border-transparent")
                }
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 max-w-2xl">
          {tab === "profile" && <SettingsProfile user={auth.user} onUpdated={() => void auth.refresh()} />}
          {tab === "keys" && <SettingsKeys />}
          {tab === "preferences" && <SettingsPreferences />}
        </main>
      </div>
    </div>
  );
}

// Per-field Save button. Disabled when the field equals the persisted
// value (matches Mike's settings pattern - each change is an explicit
// action, more legal-workspace-y than a single bottom Save).
function FieldSave({
  dirty,
  busy,
  onClick,
}: {
  dirty: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!dirty || busy}
      onClick={onClick}
      className="bg-ink text-paper px-5 hover:bg-seal transition-colors text-sm font-medium disabled:bg-wash disabled:text-muted disabled:cursor-not-allowed min-h-[44px] shrink-0"
    >
      {busy ? "Saving" : "Save"}
    </button>
  );
}

function SettingsProfile({
  user,
  onUpdated,
}: {
  user: CurrentUser;
  onUpdated: () => void;
}) {
  const auth = useAuth();
  const [name, setName] = useState(user.name ?? "");
  const [password, setPassword] = useState("");
  const [defaultModel, setDefaultModel] = useState(user.default_model_id ?? "");
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyField, setBusyField] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listModels()
      .then((rows) => live && setModels(rows))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, []);

  // Persisted (last-saved) values - drive the dirty flag per field.
  const [savedName, setSavedName] = useState(user.name ?? "");
  const [savedModel, setSavedModel] = useState(user.default_model_id ?? "");

  useEffect(() => {
    setSavedName(user.name ?? "");
    setSavedModel(user.default_model_id ?? "");
  }, [user]);

  const saveField = async (
    field: "name" | "password" | "default_model_id",
    patch: import("../lib/api").UserProfileUpdate,
  ) => {
    setBusyField(field);
    setError(null);
    try {
      await updateProfile(patch);
      if (field === "name") setSavedName(name);
      if (field === "default_model_id") setSavedModel(defaultModel);
      if (field === "password") setPassword("");
      onUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not save ${field.replace(/_/g, " ")}. ${msg}`);
    } finally {
      setBusyField(null);
    }
  };

  const onDeleteAccount = async () => {
    const ok = window.confirm(
      "Delete your account? Your matters and audit trail will be retained; your profile and sessions will be cleared.",
    );
    if (!ok) return;
    setBusyField("delete");
    setError(null);
    try {
      await deleteAccount();
      // Soft-deleted server-side; bounce home BEFORE clearing the auth
      // state so the AppShell guard doesn't race us onto signin.
      navigate("/");
      await auth.signOut();
    } catch (err) {
      if (err instanceof AccountHasMattersError) {
        setError(
          `Cannot delete account yet. ${err.matterCount} matter${err.matterCount === 1 ? "" : "s"} still attached. Export or delete matters first (matter-delete lands in v0.2).`,
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Could not delete account. ${msg}`);
      }
    } finally {
      setBusyField(null);
    }
  };

  // v0.1 plan field is display-only - no billing semantics. Capitalise
  // the tier for the badge ("free" -> "Free"); fall back to "Free" if
  // an older user predates the column (server default backfills, so
  // this is defensive).
  const planLabel = (user.plan || "free").replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionRule label="Profile" />
        <p className="prose-p mb-0 mt-3">
          Visible in audit rows. Email and verification status read-only.
        </p>
      </div>

      {error && <ErrorCallout message={error} />}

      <div>
        <label className="eyebrow mb-2 block">Email</label>
        <div className="flex gap-3">
          <input
            type="email"
            value={user.email}
            disabled
            className={inputCls + " opacity-60 cursor-not-allowed"}
          />
        </div>
        <p className="text-xs text-muted mt-2">
          {user.is_verified ? "Verified." : "Unverified. Check your inbox."}
        </p>
      </div>

      <div>
        <label className="eyebrow mb-2 block">Display name</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            className={inputCls}
          />
          <FieldSave
            dirty={name !== savedName}
            busy={busyField === "name"}
            onClick={() => void saveField("name", { name })}
          />
        </div>
      </div>

      <div>
        <label className="eyebrow mb-2 block">New password</label>
        <div className="flex gap-3">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            placeholder="leave blank to keep current"
            className={inputCls}
          />
          <FieldSave
            dirty={password.length > 0}
            busy={busyField === "password"}
            onClick={() => void saveField("password", { password })}
          />
        </div>
      </div>

      <div>
        <label className="eyebrow mb-2 block">Default model</label>
        <div className="flex gap-3">
          {models && models.length > 0 ? (
            <select
              value={defaultModel}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setDefaultModel(e.target.value)}
              className={inputCls}
            >
              {/* Allow "no default" so the backend default applies. */}
              <option value="">No default (use system default)</option>
              {models.map((m) => {
                const needsKey = m.requires_key && !m.key_configured;
                const provider = m.provider
                  ? m.provider.charAt(0).toUpperCase() + m.provider.slice(1)
                  : "";
                return (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.requires_key
                      ? ` — needs ${provider || "provider"} key${
                          needsKey ? " (not configured)" : " (configured)"
                        }`
                      : " — no key needed"}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              type="text"
              value={defaultModel}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDefaultModel(e.target.value)}
              placeholder="claude-opus-4-7"
              className={inputCls + " tech-token"}
            />
          )}
          <FieldSave
            dirty={defaultModel !== savedModel}
            busy={busyField === "default_model_id"}
            onClick={() =>
              void saveField("default_model_id", { default_model_id: defaultModel || null })
            }
          />
        </div>
        <p className="text-xs text-muted mt-2">
          Used for new matters when none is chosen. A model that needs a provider key
          only runs once that key is added below.
        </p>
      </div>

      {/* Usage Plan */}
      <div className="mt-12">
        <SectionRule label="Usage Plan" />
        <div className="mt-4 text-sm font-semibold text-ink capitalize">{planLabel}</div>
      </div>

      {/* Actions */}
      <div className="mt-12">
        <SectionRule label="Actions" />
        <div className="mt-4">
          <SignOutButton />
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-12">
        <SectionRule label="Danger zone" />
        <p className="mt-4 text-sm text-muted mb-4">
          Deleting your account removes all matters and audit history. This action cannot be undone.
        </p>
        <button
          type="button"
          onClick={onDeleteAccount}
          className="border border-seal text-seal hover:bg-seal hover:text-paper px-4 py-2 transition-colors text-sm font-medium min-h-[44px]"
        >
          Delete account
        </button>
      </div>

    </div>
  );
}

// SignOut button reads from AuthProvider via useAuth.
function SignOutButton() {
  const auth = useAuth();
  const handle = async () => {
    // "/" first, then signOut — landing is public, so the AppShell auth
    // guard can't race this navigate onto signin.
    navigate("/");
    await auth.signOut();
  };
  return (
    <button
      type="button"
      onClick={() => void handle()}
      className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center gap-2"
    >
      <span>Sign out</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3H3v10h3" />
        <path d="M10 11l3-3-3-3" />
        <path d="M13 8H7" />
      </svg>
    </button>
  );
}

function SettingsKeys() {
  const [keys, setKeys] = useState<UserApiKeyRead[] | null>(null);
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await listApiKeys();
      setKeys(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not load API keys. ${msg}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    setBusy(true);
    setError(null);
    try {
      await upsertApiKey(provider, apiKey);
      setApiKey("");
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not save key. ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: string) => {
    const ok = window.confirm(
      `Remove your ${p} key? Model calls will fall back to the keyless demo model until you add a key again. This writes a user.key.revoked audit row.`,
    );
    if (!ok) return;
    setError(null);
    try {
      await deleteApiKey(p);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not remove key. ${msg}`);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionRule label="Provider keys" />
        <p className="prose-p mb-0 mt-3">
        The hosted site has no shared production model key. To run real
        model calls, bring your own Anthropic or OpenAI key. Keys are
        encrypted and used only for your requests — Legalise does not
        resell model access.
        </p>
      </div>

      {keys && <ProviderStatus hasKey={keys.length > 0} />}

      {!keys && <LoadingLine label="loading keys" />}
      {keys && keys.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">No keys yet. Add one below.</div>
      )}
      {keys && keys.length > 0 && (
        <div className="border border-rule overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="grid grid-cols-[140px_1fr_160px_100px] gap-4 px-4 py-3 bg-paper border-b border-ink text-[10px] uppercase tracking-[0.18em] text-muted">
              <span>Provider</span>
              <span>Created</span>
              <span>Last used</span>
              <span></span>
            </div>
            {keys.map((k) => (
              <div
                key={k.provider}
                className="grid grid-cols-[140px_1fr_160px_100px] gap-4 px-4 py-3 border-b border-rule tech-token text-[11px] items-center"
              >
                <span className="flex flex-col">
                  <span className="text-ink font-bold uppercase">{k.provider}</span>
                  <span className="normal-case font-sans text-[10px] text-muted tracking-normal">
                    {k.provider === "anthropic"
                      ? "Claude models"
                      : k.provider === "openai"
                        ? "GPT models"
                        : "model calls"}
                  </span>
                </span>
                <span className="text-muted">{k.created_at.slice(0, 10)}</span>
                <span className="text-muted">
                  {k.last_used_at ? k.last_used_at.slice(0, 16).replace("T", " ") : "-"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(k.provider)}
                  className="text-seal text-xs hover:underline justify-self-end"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="flex flex-col gap-6 pt-8" onSubmit={submit}>
        <SectionRule label="Add or replace a key" />
        <p className="text-xs text-muted -mt-3">
          Saving a key writes a <span className="tech-token">user.key.configured</span> audit
          row and switches your model calls from the keyless demo model to your provider.
        </p>
        <Field
          label="Provider"
          hint="Anthropic key is used by Claude models; OpenAI key by GPT models"
        >
          <select
            value={provider}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setProvider(e.target.value as "anthropic" | "openai")}
            className={inputCls}
          >
            <option value="anthropic">Anthropic — used by Claude models</option>
            <option value="openai">OpenAI — used by GPT models</option>
          </select>
        </Field>
        <Field label="API key" hint="stored encrypted; the full key is never shown after submission">
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className={inputCls + " tech-token"}
          />
        </Field>
        {error && <ErrorCallout message={error} />}
        <button type="submit" disabled={busy || !apiKey} className={primaryBtn + " self-start"}>
          {busy ? "Saving" : "Save key"}
        </button>
      </form>
    </div>
  );
}

// Honest "can I run real model calls?" status. We never
// claim a key is *valid* (no provider test-call endpoint exists; that's
// a filed, deferred backend gap). Presence on file = "configured, not
// tested"; absence = keyless demo model.
function ProviderStatus({ hasKey }: { hasKey: boolean }) {
  if (!hasKey) {
    return (
      <div className="border border-rule bg-wash p-4">
        <div className="text-sm font-semibold text-ink">No key configured</div>
        <p className="mt-1 text-sm text-muted">
          Using the keyless demo model. Add a provider key below to run
          real model calls on your own account.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-rule bg-wash p-4">
      <div className="text-sm font-semibold text-ink">Key stored — not yet verified</div>
      <p className="mt-1 text-sm text-muted">
        Verified: the key's format is stored and encrypted, and it will be
        used for your model calls. Not verified: Legalise has not made a test
        call to the provider, so a wrong, revoked, or out-of-credit key only
        shows up on the first real call.
      </p>
    </div>
  );
}

function SettingsPreferences() {
  return (
    <div className="flex flex-col gap-6">
      <SectionRule label="Preferences" />
      <div className="bg-wash p-6 border-l-4 border-ink">
        <div className="eyebrow-sm mb-2">ROADMAP - v0.2</div>
        <p className="prose-p mb-0">
          Per-user defaults (timezone, locale, retention reminders) land in v0.2 alongside the
          Skill lifecycle work. v0.1 ships with system defaults applied uniformly.
        </p>
      </div>
    </div>
  );
}
