import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAccessFor(host: string, mode: "open" | "waitlist" | undefined) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (mode) vi.stubEnv("VITE_HOSTED_ACCESS_MODE", mode);
  vi.stubGlobal("location", { hostname: host });
  return import("./access");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("HOSTED_ACCESS_WAITLIST", () => {
  it("stays open by default on self-hosted domains", async () => {
    const access = await loadAccessFor("localhost", undefined);
    expect(access.HOSTED_ACCESS_WAITLIST).toBe(false);
  });

  it("does not waitlist localhost even when waitlist mode is baked in", async () => {
    const access = await loadAccessFor("localhost", "waitlist");
    expect(access.HOSTED_ACCESS_WAITLIST).toBe(false);
  });

  it("waitlists legalise.dev when waitlist mode is baked in", async () => {
    const access = await loadAccessFor("legalise.dev", "waitlist");
    expect(access.HOSTED_ACCESS_WAITLIST).toBe(true);
  });

  it("keeps legalise.dev open when open mode is baked in", async () => {
    const access = await loadAccessFor("legalise.dev", "open");
    expect(access.HOSTED_ACCESS_WAITLIST).toBe(false);
  });
});
