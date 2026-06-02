import type {
  GrantRow,
  InstalledModule,
  V2ManifestEntry,
} from "../lib/api";

export interface ManifestCapability {
  id: string;
  label: string;
  defaultRequest: string | null;
  inputFields: RunnerInputField[];
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
  inputFields: RunnerInputField[];
  reads: string[];
  writes: string[];
  modelAccess: string;
  signatureStatus: string;
  sourceKind: string;
}

const INVOKABLE_KINDS = new Set(["skill", "tool", "workflow"]);
const RESERVED_ARG_KEYS = new Set([
  "input",
  "question",
  "document_id",
  "document_ids",
]);

export interface RunnerInputField {
  key: string;
  label: string;
  description: string | null;
  kind: "text" | "select";
  options: string[];
  defaultValue: string;
  required: boolean;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function runnerInputFields(value: unknown): RunnerInputField[] {
  if (!value || typeof value !== "object") return [];
  const schema = value as Record<string, unknown>;
  const rawProperties = schema.properties;
  if (!rawProperties || typeof rawProperties !== "object") return [];
  const required = new Set(strArray(schema.required));
  return Object.entries(rawProperties as Record<string, unknown>).flatMap(
    ([key, raw]): RunnerInputField[] => {
      if (RESERVED_ARG_KEYS.has(key)) return [];
      if (!raw || typeof raw !== "object") return [];
      const prop = raw as Record<string, unknown>;
      if (prop.type !== "string") return [];
      const options = strArray(prop.enum);
      return [{
        key,
        label: str(prop.title) ?? key,
        description: str(prop.description),
        kind: options.length > 0 ? "select" : "text",
        options,
        defaultValue: str(prop.default) ?? (options[0] ?? ""),
        required: required.has(key),
      }];
    },
  );
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
      inputFields: runnerInputFields(obj.args_schema),
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
        inputFields: cap.inputFields,
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
