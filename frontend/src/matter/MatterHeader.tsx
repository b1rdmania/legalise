// MatterHeader - lean header strip for the matter workspace shell.
// Replaces the in-tab document hero (DESIGN.md old §P8). Eyebrow + h1 +
// 5-item metadata strip (Slug, Opened, Retention, Status, Posture).
// Posture stack hosts <PrivilegeControl> as the value.

import type { Matter } from "../lib/api";
import { PrivilegeControl } from "./PrivilegeControl";

export function MatterHeader({
  matter,
  onPostureChange,
}: {
  matter: Matter;
  onPostureChange: (next: string) => void;
}) {
  return (
    <header className="pt-12 pb-6 border-b border-rule">
      <div className="text-xs font-mono text-muted mb-4 uppercase tracking-widest">
        Matter · {matter.matter_type.replace(/_/g, " ")}
      </div>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink leading-[1.05]">
        {matter.title}
      </h1>

      <div className="flex flex-wrap gap-x-10 gap-y-4 mt-10">
        <div>
          <div className="eyebrow mb-1.5">Slug</div>
          <div className="text-sm font-semibold text-ink">{matter.slug}</div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Opened</div>
          <div className="text-sm font-semibold text-ink">
            {matter.opened_at.slice(0, 10)}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Retention</div>
          <div className="text-sm font-semibold text-ink">
            {matter.retention_until?.slice(0, 10) ?? "-"}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Status</div>
          <div className="text-sm font-semibold text-ink">{matter.status}</div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Posture</div>
          <PrivilegeControl value={matter.privilege_posture} onChange={onPostureChange} />
        </div>
      </div>
    </header>
  );
}
