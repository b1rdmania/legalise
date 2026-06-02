import type {
  GrantRow,
  InstalledModule,
  V2ManifestEntry,
} from "../lib/api";

export interface ManifestCapability {
  id: string;
  label: string;
  defaultRequest: string | null;
  kind: string;
  scope: string;
  reads: string[];
  writes: string[];
  modelAccess: string;
  streamingMode: string;
}

export interface RunnableMatterSkill {
  moduleId: string;
  capabilityId: string;
  title: string;
  description: string;
  defaultRequest: string | null;
  reads: string[];
  writes: string[];
  modelAccess: string;
  signatureStatus: string;
  sourceKind: string;
}

const INVOKABLE_KINDS = new Set(["skill", "tool", "workflow"]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export function manifestText(
  entry: V2ManifestEntry,
  key: string,
): string | null {
  return str((entry.manifest as Record<string, unknown>)[key]);
}

export function manifestCapabilities(
  entry: V2ManifestEntry,
): ManifestCapability[] {
  const raw = (entry.manifest as Record<string, unknown>).capabilities;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): ManifestCapability[] => {
    if (!item || typeof item !== "object") return [];
    const obj = item as Record<string, unknown>;
    const id = str(obj.id);
    if (!id) return [];
    const ui = obj.ui && typeof obj.ui === "object" ? obj.ui as Record<string, unknown> : {};
    return [{
      id,
      label: str(ui.label) ?? id,
      defaultRequest: str(ui.default_request),
      kind: str(obj.kind) ?? "skill",
      scope: str(obj.scope) ?? "workspace",
      reads: strArray(obj.reads),
      writes: strArray(obj.writes),
      modelAccess: str(obj.model_access) ?? "none",
      streamingMode: str(obj.streaming_mode) ?? "sync",
    }];
  });
}

export function grantKey(moduleId: string, capabilityId: string): string {
  return `${moduleId}::${capabilityId}`;
}

export function grantedCapabilityKeys(grants: GrantRow[] | null): Set<string> {
  const keys = new Set<string>();
  for (const g of grants ?? []) keys.add(grantKey(g.plugin, g.skill));
  return keys;
}

function capabilityHasRequiredGrantRows(
  cap: ManifestCapability,
  moduleId: string,
  grants: GrantRow[] | null,
): boolean {
  const required = [...cap.reads, ...cap.writes];
  if (required.length === 0) return true;
  const granted = new Set(
    (grants ?? [])
      .filter((g) => g.plugin === moduleId && g.skill === cap.id)
      .map((g) => g.capability),
  );
  return required.every((need) => granted.has(need));
}

export function runnableMatterSkills({
  modules,
  installed,
  grants,
}: {
  modules: V2ManifestEntry[];
  installed: Map<string, InstalledModule>;
  grants: GrantRow[] | null;
}): RunnableMatterSkill[] {
  const out: RunnableMatterSkill[] = [];
  for (const entry of modules) {
    if (!entry.is_valid) continue;
    const inst = installed.get(entry.module_id);
    if (!inst?.enabled) continue;
    const moduleName = manifestText(entry, "name") ?? entry.module_id;
    const description = manifestText(entry, "description") ?? "";
    for (const cap of manifestCapabilities(entry)) {
      if (cap.scope !== "matter") continue;
      if (!INVOKABLE_KINDS.has(cap.kind)) continue;
      if (!capabilityHasRequiredGrantRows(cap, entry.module_id, grants)) continue;
      out.push({
        moduleId: entry.module_id,
        capabilityId: cap.id,
        title: cap.label === cap.id ? moduleName : cap.label,
        description,
        defaultRequest: cap.defaultRequest,
        reads: cap.reads,
        writes: cap.writes,
        modelAccess: cap.modelAccess,
        signatureStatus: inst.signature_status,
        sourceKind: entry.source_kind,
      });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export function shortCapabilityList(values: string[]): string {
  if (values.length === 0) return "Nothing extra";
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} +${values.length - 2} more`;
}
