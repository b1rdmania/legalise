/**
 * Plain-English narration for audit entries (DESIGN.md P29 §1).
 *
 * One sentence per action: what happened, in the user's vocabulary.
 * The technical material (hashes, ids, raw payload) stays in the
 * drawer's "Technical record" disclosure — complete, but never leading.
 * Posture values narrate as Active/Paused, never the enum.
 */

import type { AuditEntry } from "../lib/api";
import { posturePaused } from "../lib/posture";

function payloadStr(entry: AuditEntry, key: string): string | null {
  const v = (entry.payload ?? {})[key];
  return typeof v === "string" ? v : null;
}

function payloadNum(entry: AuditEntry, key: string): number | null {
  const v = (entry.payload ?? {})[key];
  return typeof v === "number" ? v : null;
}

/** One plain sentence for what this entry records. */
export function narrateEntry(entry: AuditEntry): string {
  const a = entry.action;

  if (a === "matter.create") return "Opened the matter.";

  if (a === "document.upload") {
    const f = payloadStr(entry, "filename");
    return f ? `Uploaded ${f}.` : "Uploaded a document.";
  }
  if (a === "document.extract") {
    return "Extracted the document text so it can be read, searched, and cited.";
  }
  if (a === "document.anonymise") {
    const n = payloadNum(entry, "entities");
    return n != null
      ? `Anonymised the document — ${n} personal identifier${n === 1 ? "" : "s"} replaced.`
      : "Anonymised the document.";
  }

  if (a === "chronology.build") {
    const n = payloadNum(entry, "events");
    return n != null
      ? `Built a chronology of ${n} events from the matter documents.`
      : "Built a chronology from the matter documents.";
  }
  if (a === "chronology.gate.confirm") {
    return "Confirmed the CPR 31.22 acknowledgement before working with disclosure material.";
  }

  if (a.startsWith("pre_motion.stage.")) {
    const stage = a.slice("pre_motion.stage.".length);
    const agents = payloadNum(entry, "sub_agents");
    return agents != null
      ? `Ran the ${stage} stage of the pre-motion assessment (${agents} parallel passes).`
      : `Ran the ${stage} stage of the pre-motion assessment.`;
  }
  if (a === "pre_motion.export.pdf") {
    return "Exported the pre-motion assessment as a PDF.";
  }

  if (a === "contract_review.run") {
    const doc = payloadStr(entry, "document");
    return doc
      ? `Reviewed ${doc} clause by clause.`
      : "Ran a contract review.";
  }

  if (a === "review.create") {
    const title = payloadStr(entry, "title");
    return title ? `Opened a review: ${title}.` : "Opened a review.";
  }
  if (a === "review.run") {
    const run = payloadNum(entry, "cells_run");
    const failed = payloadNum(entry, "cells_failed");
    if (run != null) {
      return failed
        ? `Ran the review — ${run} checks, ${failed} flagged.`
        : `Ran the review — ${run} checks, none flagged.`;
    }
    return "Ran the review.";
  }

  if (a === "matter.privilege.changed") {
    const to = payloadStr(entry, "to");
    const reason = payloadStr(entry, "reason");
    const verb = to && posturePaused(to) ? "Paused" : "Resumed";
    return reason
      ? `${verb} the matter — ${reason}.`
      : `${verb} the matter.`;
  }
  if (a.startsWith("posture_gate.") && a.endsWith(".blocked")) {
    return "Blocked a model call because the matter is paused. No content left the workspace.";
  }

  if (a === "document.edit.accepted") {
    return "Accepted a tracked change in the document.";
  }

  if (a === "output.signed") return "Signed the output — a named person took responsibility for it.";
  if (a === "output.signed_with_observations") {
    return "Signed the output with observations recorded.";
  }
  if (a === "output.sign_rejected") return "Rejected the output at sign-off.";

  if (a === "document.summarise") {
    const doc = payloadStr(entry, "document");
    return doc ? `Summarised ${doc}.` : "Summarised a document.";
  }

  if (a === "retrieval.search") {
    const ids = (entry.payload ?? {})["document_ids"];
    const docCount = Array.isArray(ids) ? ids.length : null;
    if (docCount != null) {
      return `Searched the matter's documents — matched ${docCount} document${docCount === 1 ? "" : "s"}.`;
    }
    const hits = payloadNum(entry, "hit_count");
    if (hits != null) {
      return `Searched the matter's documents — ${hits} passage${hits === 1 ? "" : "s"} matched.`;
    }
    return "The assistant searched the matter's documents; the record keeps the query length and which documents matched.";
  }

  if (a === "module.enabled") return "Enabled a skill on this matter.";
  if (a === "module.grant.created") return "Granted a skill permission to run.";
  if (a === "module.grant.revoked") return "Revoked a skill's permission.";
  if (a === "module.capability.invoked") return "Ran a skill.";

  if (a === "model.call") {
    const model = entry.model_used;
    const tokens = entry.token_count;
    const lead = model
      ? `Sent a prompt to the ${model} model`
      : "Sent a prompt to the model";
    const tail =
      tokens != null
        ? `; ${tokens} token${tokens === 1 ? "" : "s"} used, and the prompt and response are recorded by hash.`
        : "; the prompt and response are recorded by hash.";
    return lead + tail;
  }

  if (a === "document.deleted") {
    const f = payloadStr(entry, "filename");
    return f ? `Deleted ${f}.` : "Deleted a document.";
  }
  if (a === "document.indexed") {
    const f = payloadStr(entry, "filename");
    return f ? `Indexed ${f} for search.` : "Indexed a document for search.";
  }
  if (a === "matter.reindexed") {
    return "Re-indexed the matter's documents for search.";
  }

  if (a === "output.review.opened") {
    return "Opened the output for review.";
  }

  if (a === "advice_boundary.check.completed") {
    return "Checked how far this output may go (the advice boundary) — within bounds.";
  }
  if (
    a === "advice_boundary.check.blocked" ||
    a === "advice_boundary.check.denied"
  ) {
    return "Held the output back at the advice boundary.";
  }

  if (a === "external.pack.ingested") {
    return "Ingested an external workspace export for supervision.";
  }

  if (a === "auth.rate_limited") {
    return "Auth rate limit reached — a request was throttled.";
  }

  // Honest fallback: humanise the raw action so even unmapped actions read
  // as a tolerable sentence (e.g. "foo.bar_baz" → "Foo bar baz.").
  return humaniseAction(a);
}

/** Turn a dotted/underscored action string into a sentence-cased phrase. */
function humaniseAction(action: string): string {
  const words = action
    .split(/[._]+/)
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!words) return action;
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}
