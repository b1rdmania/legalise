import { useEffect, useState } from "react";
import type { CurrentUser } from "../lib/api";

export function ProfileChip({
  user,
  onSignOut,
}: {
  user: CurrentUser;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);

  // close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-chip]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (user.name || user.email).slice(0, 1).toUpperCase();
  const label = user.name || user.email;

  return (
    <div className="relative" data-profile-chip>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-ink hover:bg-wash min-h-[44px] px-2 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="w-8 h-8 bg-ink text-paper flex items-center justify-center font-mono text-sm font-semibold">
          {initial}
        </span>
        <span className="text-sm truncate max-w-[180px]">{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
        className="absolute right-0 top-full mt-1 w-56 rounded-card bg-paper border border-rule flex flex-col text-sm"
        >
          <div className="px-4 py-3 border-b border-rule">
            <div className="eyebrow-sm mb-1">Signed in as</div>
            <div className="text-ink truncate">{user.email}</div>
          </div>
          <a
            href="/settings/profile"
            onClick={() => setOpen(false)}
            className="px-4 py-3 text-ink hover:bg-wash"
            role="menuitem"
          >
            Settings
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="px-4 py-3 text-left text-muted hover:text-ink hover:bg-wash border-t border-rule"
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
