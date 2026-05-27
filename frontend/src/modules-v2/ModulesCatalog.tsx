/**
 * Phase 14 B — /modules catalog (v2).
 *
 * Lists every discovered module in v2 manifest form. Each card links
 * to `/modules/{module_id}` for detail + install.
 *
 * GAP — finding 14-B-#1 (BACKEND_GAP_AUDIT.md): the substrate has no
 * "list installed modules" endpoint, so this catalog cannot render
 * an "Installed vX" badge at-a-glance. We render "Open" on every card
 * and surface install state inside the detail page instead. Reviewer
 * decides whether to close the gap before Phase 14 D depends on it.
 *
 * Reviewer-narrow: no install ceremony triggered from this page; no
 * inline enable/disable. The catalog's job is "list + link to detail".
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  getModulesV2,
  listInstalledModules,
  type InstalledModule,
  type V2ManifestEntry,
} from "../lib/api";

type CatalogQuery =
  | { status: "loading" }
  | { status: "ready"; entries: V2ManifestEntry[] }
  | { status: "error"; message: string };

type InstalledIndex = Map<string, InstalledModule>;

function manifestField(m: V2ManifestEntry, key: string): string | undefined {
  const v = (m.manifest as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function manifestCount(m: V2ManifestEntry, key: string): number {
  const v = (m.manifest as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.length : 0;
}

export function ModulesCatalog() {
  const [q, setQ] = useState<CatalogQuery>({ status: "loading" });
  // Phase 14.5 B — installed state. Renders as a badge per card.
  // The fetch is parallel with the catalog fetch; the badge
  // gracefully omits if listInstalledModules fails (catalog still
  // shows "Open" as the affordance — the gap is no worse than
  // pre-14.5 B).
  const [installed, setInstalled] = useState<InstalledIndex | null>(null);

  useEffect(() => {
    let cancelled = false;
    getModulesV2()
      .then((res) => {
        if (!cancelled) setQ({ status: "ready", entries: res.modules });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    listInstalledModules()
      .then((rows) => {
        if (cancelled) return;
        const idx: InstalledIndex = new Map();
        for (const row of rows) idx.set(row.module_id, row);
        setInstalled(idx);
      })
      .catch(() => {
        // Catalog still renders; badge just omits.
        if (!cancelled) setInstalled(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Workspace</p>
      <h1 className="mt-2 text-3xl font-serif">Modules</h1>
      <p className="mt-3 text-sm text-muted">
        Discovered modules in the workspace registry. Click a module to
        review its capabilities, permissions, and install state.
      </p>

      {q.status === "loading" && (
        <p className="mt-8 text-sm text-muted">Loading modules…</p>
      )}
      {q.status === "error" && (
        <p className="mt-8 text-sm text-seal">
          Could not load modules: {q.message}
        </p>
      )}
      {q.status === "ready" && q.entries.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          No modules discovered. Modules live under the workspace plugins
          root; check the registry path.
        </p>
      )}
      {q.status === "ready" && q.entries.length > 0 && (
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {q.entries.map((m) => (
            <ModuleCard
              key={m.module_id}
              entry={m}
              installed={installed?.get(m.module_id) ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ModuleCard({
  entry,
  installed,
}: {
  entry: V2ManifestEntry;
  installed: InstalledModule | null;
}) {
  const name = manifestField(entry, "name") ?? entry.module_id;
  const version = manifestField(entry, "version");
  const publisher = manifestField(entry, "publisher");
  const visibility = manifestField(entry, "visibility");
  const description = manifestField(entry, "description");
  const caps = manifestCount(entry, "capabilities");

  return (
    <li className="rounded-md border border-line p-4 hover:border-ink">
      <Link
        to="/modules/$moduleId"
        params={{ moduleId: entry.module_id }}
        className="block"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-medium">{name}</h2>
          {version && (
            <span className="text-xs font-mono text-muted">v{version}</span>
          )}
        </div>
        <p className="mt-1 text-xs font-mono text-muted">{entry.module_id}</p>
        {description && (
          <p className="mt-2 text-sm text-muted line-clamp-2">{description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {publisher && <span>by {publisher}</span>}
          {visibility && (
            <span className="rounded-sm border border-line px-1.5 py-0.5">
              {visibility}
            </span>
          )}
          <span>
            {caps} capabilit{caps === 1 ? "y" : "ies"}
          </span>
          {/* Phase 14.5 B — installed-state badge. Three states:
              - installed + enabled: "Installed vX.Y" (ink-on-paper)
              - installed + disabled: "Installed (disabled)" (muted)
              - not installed: no badge (catalog cards default to
                "Open" as the affordance) */}
          {installed && installed.enabled && (
            <span
              data-testid={`installed-badge-${entry.module_id}`}
              className="rounded-sm border border-ink bg-ink/5 px-1.5 py-0.5 text-ink"
            >
              Installed v{installed.version}
            </span>
          )}
          {installed && !installed.enabled && (
            <span
              data-testid={`installed-disabled-badge-${entry.module_id}`}
              className="rounded-sm border border-line bg-paper-sunken px-1.5 py-0.5 text-muted"
              title={`Installed v${installed.version} but currently disabled`}
            >
              Installed (disabled)
            </span>
          )}
          {!entry.is_valid && (
            <span className="rounded-sm bg-seal/10 px-1.5 py-0.5 text-seal">
              manifest invalid
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
