import { describe, expect, it } from "vitest";
import { POSTURE_DOT_COLOR, postureDot, postureLabel, posturePaused } from "./posture";

describe("posture presentation vocabulary", () => {
  it("collapses A_cleared and B_mixed to Active", () => {
    expect(postureLabel("A_cleared")).toBe("Active");
    expect(postureLabel("B_mixed")).toBe("Active");
    expect(posturePaused("A_cleared")).toBe(false);
    expect(posturePaused("B_mixed")).toBe(false);
  });

  it("maps C_paused to Paused", () => {
    expect(postureLabel("C_paused")).toBe("Paused");
    expect(posturePaused("C_paused")).toBe(true);
  });

  it("dot colours follow the two states", () => {
    expect(postureDot("B_mixed")).toBe(POSTURE_DOT_COLOR.active);
    expect(postureDot("C_paused")).toBe(POSTURE_DOT_COLOR.paused);
  });
});
