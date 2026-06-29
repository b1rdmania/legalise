import { describe, expect, it } from "vitest";
import {
  POSTURE_DOT_COLOR,
  postureDot,
  postureExplain,
  postureLabel,
  posturePaused,
} from "./posture";

describe("posture presentation vocabulary", () => {
  it("gives A_cleared and B_mixed distinct, meaningful labels", () => {
    expect(postureLabel("A_cleared")).toBe("Cloud cleared");
    expect(postureLabel("B_mixed")).toBe("Mixed (default)");
    expect(posturePaused("A_cleared")).toBe(false);
    expect(posturePaused("B_mixed")).toBe(false);
  });

  it("maps C_paused to a paused, no-AI label", () => {
    expect(postureLabel("C_paused")).toBe("Paused (no AI)");
    expect(posturePaused("C_paused")).toBe(true);
  });

  it("explains each state in one plain line", () => {
    expect(postureExplain("A_cleared")).toMatch(/any model may run/i);
    expect(postureExplain("B_mixed")).toMatch(/default access/i);
    expect(postureExplain("C_paused")).toMatch(/no model may run/i);
  });

  it("dot colours follow the two states", () => {
    expect(postureDot("B_mixed")).toBe(POSTURE_DOT_COLOR.active);
    expect(postureDot("C_paused")).toBe(POSTURE_DOT_COLOR.paused);
  });
});
