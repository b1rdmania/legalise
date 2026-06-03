import { describe, expect, it } from "vitest";

import { buildVersionDiff } from "./VersionDiff";

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
});
