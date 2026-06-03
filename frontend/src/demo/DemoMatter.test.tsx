import { describe, expect, it } from "vitest";

import { splitSearchMatches } from "./DemoMatter";

describe("DemoMatter document search", () => {
  it("splits all case-insensitive matches without changing source text", () => {
    const text = "Witness statement says the witness raised a grievance.";
    const segments = splitSearchMatches(text, "witness");

    expect(segments.filter((segment) => segment.match).map((segment) => segment.text)).toEqual([
      "Witness",
      "witness",
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
  });

  it("returns the original text as a non-match for empty queries", () => {
    expect(splitSearchMatches("No search", "   ")).toEqual([
      { text: "No search", match: false },
    ]);
  });
});
