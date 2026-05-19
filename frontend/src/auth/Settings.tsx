import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  AccountHasMattersError,
  deleteAccount,
  deleteApiKey,
  listApiKeys,
  updateProfile,
  upsertApiKey,
  type CurrentUser,
  type UserApiKeyRead,
} from "../lib/api";
import { navigate } from "../lib/route";
import { useAuth } from "./AuthProvider";
import {
  ErrorCallout,
  Field,
  LoadingLine,
  inputCls,
  primaryBtn,
} from "../ui/primitives";

export type SettingsTab = "profile" | "keys" | "preferences";

export function Settings({ tab }: { tab: SettingsTab }) {
  const auth = useAuth();

  // Protect: bounce to signin if unauthenticated (after loading completes).
  useEffect(() => {
    if (!auth.loading && !auth.user) navigate("/auth/signin");
  }, [auth.loading, auth.user]);

  if (auth.loading || !auth.user) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
        <LoadingLine label="loading account" />
      </div>
    );
  }

  const sidebarItems: { key: SettingsTab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "keys", label: "API keys" },
    { key: "preferences", label: "Preferences" },
  ];

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1]">
          Settings
        </h1>
      </div>
      <div className="flex flex-col lg:flex-row gap-10">
        <aside className="lg:w-64 shrink-0 lg:border-r lg:border-rule lg:pr-6">
          <nav className="flex lg:flex-col gap-1 border-b lg:border-b-0 border-rule lg:border-0">
            {sidebarItems.map((item) => (
              <a
                key={item.key}
                href={`#/settings/${item.key}`}
                className={
                  "py-2 lg:py-2 px-3 lg:px-4 text-sm transition-colors lg:border-l-2 -mb-px lg:-ml-px " +
                  (tab === item.key
                    ? "text-ink font-semibold lg:border-ink lg:bg-wash"
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
      className="bg-ink text-paper px-5 hover:bg-black transition-colors text-sm font-medium disabled:bg-wash disabled:text-muted disabled:cursor-not-allowed min-h-[44px] shrink-0"
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
  const [defaultPosture, setDefaultPosture] = useState(user.default_privilege_posture ?? "B_mixed");
  const [error, setError] = useState<string | null>(null);
  const [busyField, setBusyField] = useState<string | null>(null);

  // Persisted (last-saved) values - drive the dirty flag per field.
  const [savedName, setSavedName] = useState(user.name ?? "");
  const [savedModel, setSavedModel] = useState(user.default_model_id ?? "");
  const [savedPosture, setSavedPosture] = useState(user.default_privilege_posture ?? "B_mixed");

  useEffect(() => {
    setSavedName(user.name ?? "");
    setSavedModel(user.default_model_id ?? "");
    setSavedPosture(user.default_privilege_posture ?? "B_mixed");
  }, [user]);

  const saveField = async (
    field: "name" | "password" | "default_model_id" | "default_privilege_posture",
    patch: import("../lib/api").UserProfileUpdate,
  ) => {
    setBusyField(field);
    setError(null);
    try {
      await updateProfile(patch);
      if (field === "name") setSavedName(name);
      if (field === "default_model_id") setSavedModel(defaultModel);
      if (field === "default_privilege_posture") setSavedPosture(defaultPosture);
      if (field === "password") setPassword("");
      onUpdated();
    } catch (err) {
      setError(String(err));
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
      // Soft-deleted server-side; clear the auth state and bounce home.
      await auth.signOut();
      navigate("/");
    } catch (err) {
      if (err instanceof AccountHasMattersError) {
        setError(
          `Cannot delete account yet. ${err.matterCount} matter${err.matterCount === 1 ? "" : "s"} still attached. Export or delete matters first (matter-delete lands in v0.2).`,
        );
      } else {
        setError(String(err));
      }
    } finally {
      setBusyField(null);
    }
  };

  // TODO(plan): backend does not yet expose a plan field on CurrentUser.
  // Surface user.role until a richer billing model lands.
  const planLabel = user.role ? user.role : "Admin";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight2 text-ink mb-2">Profile</h2>
        <p className="prose-p mb-0">Visible in audit rows. Email and verification status read-only.</p>
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
          <input
            type="text"
            value={defaultModel}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDefaultModel(e.target.value)}
            placeholder="claude-opus-4-7"
            className={inputCls + " font-mono"}
          />
          <FieldSave
            dirty={defaultModel !== savedModel}
            busy={busyField === "default_model_id"}
            onClick={() =>
              void saveField("default_model_id", { default_model_id: defaultModel || null })
            }
          />
        </div>
        <p className="text-xs text-muted mt-2">Model id used for new matters when none specified.</p>
      </div>

      <div>
        <label className="eyebrow mb-2 block">Default privilege posture</label>
        <div className="flex gap-3">
          <select
            value={defaultPosture}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setDefaultPosture(e.target.value)}
            className={inputCls}
          >
            <option value="A_cleared">A · cleared</option>
            <option value="B_mixed">B · mixed</option>
            <option value="C_paused">C · paused</option>
          </select>
          <FieldSave
            dirty={defaultPosture !== savedPosture}
            busy={busyField === "default_privilege_posture"}
            onClick={() =>
              void saveField("default_privilege_posture", {
                default_privilege_posture: defaultPosture,
              })
            }
          />
        </div>
      </div>

      {/* Usage Plan */}
      <div>
        <div className="eyebrow mb-4 mt-12">Usage Plan</div>
        <div className="text-sm font-semibold text-ink capitalize">{planLabel}</div>
      </div>

      {/* Actions */}
      <div>
        <div className="eyebrow mb-4 mt-12">Actions</div>
        <SignOutButton />
      </div>

      {/* Danger zone */}
      <div>
        <div className="eyebrow mb-4 mt-12 text-[#D9304F]">Danger Zone</div>
        <p className="text-sm text-muted mb-4">
          Deleting your account removes all matters and audit history. This action cannot be undone.
        </p>
        <button
          type="button"
          onClick={onDeleteAccount}
          className="border border-[#D9304F] text-[#D9304F] hover:bg-[#FEF2F2] px-4 py-2 transition-colors text-sm font-medium min-h-[44px]"
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
    try {
      await auth.signOut();
    } finally {
      navigate("/auth/signin");
    }
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
      setError(String(err));
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
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: string) => {
    setError(null);
    try {
      await deleteApiKey(p);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight2 text-ink mb-2">API keys</h2>
        <p className="prose-p mb-0">
          Bring your own provider key. Stored encrypted server-side and used by the privilege-aware
          model gateway for every call on your matters.
        </p>
      </div>

      {!keys && <LoadingLine label="loading keys" />}
      {keys && keys.length === 0 && (
        <div className="border border-rule p-6 text-sm text-muted">No keys yet. Add one below.</div>
      )}
      {keys && keys.length > 0 && (
        <div className="border border-rule overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="grid grid-cols-[140px_1fr_160px_100px] gap-4 px-4 py-3 text-muted bg-paper border-b border-rule font-mono uppercase tracking-track2 text-[9px]">
              <span>Provider</span>
              <span>Created</span>
              <span>Last used</span>
              <span></span>
            </div>
            {keys.map((k) => (
              <div
                key={k.provider}
                className="grid grid-cols-[140px_1fr_160px_100px] gap-4 px-4 py-3 border-b border-rule font-mono text-[11px] items-center"
              >
                <span className="text-ink font-bold uppercase">{k.provider}</span>
                <span className="text-muted">{k.created_at.slice(0, 10)}</span>
                <span className="text-muted">
                  {k.last_used_at ? k.last_used_at.slice(0, 16).replace("T", " ") : "-"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(k.provider)}
                  className="text-[#D9304F] text-xs hover:underline justify-self-end"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="flex flex-col gap-6 border-t border-rule pt-8" onSubmit={submit}>
        <h3 className="text-lg font-semibold text-ink">Add or replace a key</h3>
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setProvider(e.target.value as "anthropic" | "openai")}
            className={inputCls}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </Field>
        <Field label="API key" hint="stored encrypted; the full key is never shown after submission">
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className={inputCls + " font-mono"}
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

function SettingsPreferences() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold tracking-tight2 text-ink mb-2">Preferences</h2>
      <div className="bg-wash p-6 border-l-4 border-ink">
        <div className="eyebrow-sm mb-2">ROADMAP - v0.2</div>
        <p className="prose-p mb-0">
          Per-user defaults (timezone, locale, retention reminders) land in v0.2 alongside the
          Module Lifecycle work. v0.1 ships with system defaults applied uniformly.
        </p>
      </div>
    </div>
  );
}
