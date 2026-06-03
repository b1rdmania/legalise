import { describe, expect, it } from "vitest";

import { buildVersionDiff, buildVersionDiffSummary } from "./VersionDiff";

describe("VersionDiff", () => {
  it("marks inserted and deleted text", () => {
    const parts = buildVersionDiff("The clause is risky.", "The clause is acceptable.");

    expect(parts.some((part) => part.type === "delete" && part.text.includes("risky"))).toBe(
      true,
    );
    expect(
      parts.some((part) => part.type === "insert" && part.text.includes("acceptable")),
    ).toBe(true);
  });

  it("summarises changed and unchanged characters", () => {
    const parts = buildVersionDiff("Alpha beta.", "Alpha beta and gamma.");
    const summary = buildVersionDiffSummary(parts);

    expect(summary.changed).toBe(true);
    expect(summary.insertedChars).toBeGreaterThan(0);
    expect(summary.deletedChars).toBe(0);
    expect(summary.unchangedChars).toBeGreaterThan(0);
  });
});
