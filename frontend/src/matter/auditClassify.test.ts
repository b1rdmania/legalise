import { describe, expect, it } from "vitest";
import {
  classifyEntry,
  isDecisionRow,
  invocationIdOf,
  artifactIdOf,
  type RowClass,
} from "./auditClassify";
import type { TimelineEntry } from "../lib/api";

function entry(over: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    source: "audit",
    occurred_at: "2026-05-28T10:00:00",
    action: "x",
    actor: {},
    matter_id: "m-1",
    module_id: null,
    capability_id: null,
    payload: {},
    refs: {},
    source_row_id: "row-1",
    ...over,
  };
}

describe("classifyEntry — straightforward classes", () => {
  const cases: [string, RowClass][] = [
    ["review.requested", "review"],
    ["review.approved", "review"],
    ["module.grant.created", "grant_role"],
    ["module.grant.revoked", "grant_role"],
    ["user.role.changed", "grant_role"],
    ["advice_boundary.check.completed", "advice"],
    ["advice_boundary.decision.completed", "advice"],
    ["model.invoked", "model"],
    ["module.enabled", "module"],
    ["http.post", "system"],
    ["audit.reconstruction.viewed", "system"],
    ["state_machine.transition.completed", "system"],
  ];
  it.each(cases)("classifies %s as %s", (action, expected) => {
    expect(classifyEntry(entry({ action }))).toBe(expected);
  });
});

describe("classifyEntry — precedence on overlapping actions", () => {
  it("review.rejected is review, not blocked_denied (review precedes)", () => {
    expect(classifyEntry(entry({ action: "review.rejected" }))).toBe("review");
  });
  it("module.ceremony.rejected is blocked_denied, not module", () => {
    expect(classifyEntry(entry({ action: "module.ceremony.rejected" }))).toBe(
      "blocked_denied",
    );
  });
  it("module.denied is blocked_denied, not module", () => {
    expect(classifyEntry(entry({ action: "module.denied" }))).toBe("blocked_denied");
  });
  it("advice_boundary.check.blocked is blocked_denied, not advice", () => {
    expect(classifyEntry(entry({ action: "advice_boundary.check.blocked" }))).toBe(
      "blocked_denied",
    );
  });
  it("module.grant.revoked is grant_role, not blocked_denied/module", () => {
    expect(classifyEntry(entry({ action: "module.grant.revoked" }))).toBe(
      "grant_role",
    );
  });
  it("a .failed action is error, ahead of everything", () => {
    expect(classifyEntry(entry({ action: "advice_boundary.check.failed" }))).toBe(
      "error",
    );
  });
  it("an error_code payload makes any row error", () => {
    expect(
      classifyEntry(entry({ action: "model.invoked", payload: { error_code: "x" } })),
    ).toBe("error");
  });
});

describe("isDecisionRow", () => {
  it("treats decision classes as decisions", () => {
    expect(isDecisionRow(entry({ action: "review.approved" }))).toBe(true);
    expect(isDecisionRow(entry({ action: "advice_boundary.decision.denied" }))).toBe(
      true,
    );
    expect(isDecisionRow(entry({ action: "user.role.changed" }))).toBe(true);
  });
  it("treats module.enabled as a decision even though its class is module", () => {
    expect(classifyEntry(entry({ action: "module.enabled" }))).toBe("module");
    expect(isDecisionRow(entry({ action: "module.enabled" }))).toBe(true);
  });
  it("treats background rows as non-decisions", () => {
    expect(isDecisionRow(entry({ action: "http.get" }))).toBe(false);
    expect(isDecisionRow(entry({ action: "model.invoked" }))).toBe(false);
  });
});

describe("invocationIdOf / artifactIdOf", () => {
  it("reads invocation_id from payload then refs", () => {
    expect(invocationIdOf(entry({ payload: { invocation_id: "inv-1" } }))).toBe("inv-1");
    expect(invocationIdOf(entry({ refs: { invocation_id: "inv-2" } }))).toBe("inv-2");
    expect(invocationIdOf(entry())).toBeNull();
  });
  it("reads artifact_id from payload (review rows)", () => {
    expect(
      artifactIdOf(entry({ action: "review.requested", payload: { artifact_id: "art-1" } })),
    ).toBe("art-1");
    expect(artifactIdOf(entry())).toBeNull();
  });
});
