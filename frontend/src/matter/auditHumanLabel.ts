// Maps substrate action strings to human-readable timeline labels.
// The raw action stays available in the expanded row for operators.

import type { TimelineEntry } from "../lib/api";

const EXACT: Record<string, string> = {
  "output.signed": "Output signed",
  "output.signed_with_observations": "Output signed with observations",
  "output.sign_rejected": "Output rejected",
  "review.approved": "Review approved",
  "review.rejected": "Review rejected",
  "review.requested": "Review requested",
  "module.capability.invoked": "Skill run started",
  "module.capability.completed": "Skill run completed",
  "module.capability.failed": "Skill run failed",
  "assistant.draft.saved": "Chat reply saved as draft",
  "retrieval.search": "Searched the matter",
  "model.invoked": "Model called",
  "model.completed": "Model response received",
  "model.failed": "Model call failed",
  "module.grant.created": "Permission granted",
  "module.grant.revoked": "Permission revoked",
  "module.enabled": "Skill enabled in matter",
  "module.disabled": "Skill disabled in matter",
  "module.ceremony.rejected": "Skill trust rejected",
  "user.role.changed": "Role changed",
  "module.export.job.created": "Working pack export started",
  "module.export.job.completed": "Working pack ready",
  "module.export.job.failed": "Working pack export failed",
  "matter.export.downloaded": "Working pack downloaded",
  "posture_gate.check.blocked": "Privilege gate blocked the run",
  "posture_gate.check.allowed": "Privilege gate allowed the run",
  "advice_boundary.decision.completed": "Advice boundary decided",
  "audit.reconstruction.viewed": "Record viewed",
};

const PREFIX_RULES: Array<{ test: (action: string) => boolean; label: string }> = [
  { test: (action) => action.startsWith("output."), label: "Output decision" },
  { test: (action) => action.startsWith("review."), label: "Human review" },
  {
    test: (action) => action.startsWith("module.export."),
    label: "Working pack activity",
  },
  {
    test: (action) => action.startsWith("module.grant."),
    label: "Permission change",
  },
  {
    test: (action) => action.startsWith("module.ceremony."),
    label: "Skill trust ceremony",
  },
  {
    test: (action) => action.startsWith("module.capability."),
    label: "Skill run",
  },
  { test: (action) => action.startsWith("model."), label: "Model activity" },
  {
    test: (action) => action.startsWith("advice_boundary."),
    label: "Advice boundary",
  },
  {
    test: (action) => action.startsWith("posture_gate."),
    label: "Privilege gate",
  },
];

function humanise(action: string): string {
  const words = action
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  if (words.length === 0) return action;
  const [head, ...rest] = words;
  return [head.charAt(0).toUpperCase() + head.slice(1), ...rest].join(" ");
}

export function humanActionLabel(entry: TimelineEntry): string {
  const action = entry.action;
  const exact = EXACT[action];
  if (exact) return exact;

  // A model call that never left the workspace because no provider key was
  // configured. The action is module-scoped (e.g. module.assistant.model
  // .key_missing), so match on the suffix rather than enumerating modules.
  if (action.endsWith(".model.key_missing")) return "Model call blocked — no API key";

  const failed = action.endsWith(".failed") || action.endsWith(".error");
  const blocked =
    action.endsWith(".blocked") ||
    action.endsWith(".denied") ||
    action.endsWith(".rejected");

  for (const rule of PREFIX_RULES) {
    if (rule.test(action)) {
      if (failed) return `${rule.label} failed`;
      if (blocked) return `${rule.label} blocked`;
      return rule.label;
    }
  }

  if (failed) return `${humanise(action.replace(/\.(failed|error)$/, ""))} failed`;
  if (blocked) {
    return `${humanise(action.replace(/\.(blocked|denied|rejected)$/, ""))} blocked`;
  }
  return humanise(action);
}
