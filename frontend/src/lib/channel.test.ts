import { beforeEach, describe, expect, it } from "vitest";
import { captureChannelFromUrl, getSignupChannel } from "./channel";

const setSearch = (search: string) => {
  window.history.replaceState({}, "", `/${search}`);
};

describe("launch channel capture", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setSearch("");
  });

  it("remembers an allowlisted ?c= tag", () => {
    setSearch("?c=hn");
    captureChannelFromUrl();
    expect(getSignupChannel()).toBe("hn");
  });

  it("normalises case", () => {
    setSearch("?c=LI");
    captureChannelFromUrl();
    expect(getSignupChannel()).toBe("li");
  });

  it("ignores tags outside the allowlist", () => {
    setSearch("?c=tiktok");
    captureChannelFromUrl();
    expect(getSignupChannel()).toBeNull();
  });

  it("keeps an earlier tag when revisiting without one", () => {
    setSearch("?c=conf");
    captureChannelFromUrl();
    setSearch("");
    captureChannelFromUrl();
    expect(getSignupChannel()).toBe("conf");
  });

  it("returns null when nothing captured", () => {
    expect(getSignupChannel()).toBeNull();
  });
});
