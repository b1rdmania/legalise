/**
 * Phase 17-IA-C — ModulesCatalog (public marketplace) tests.
 *
 * The catalog now reads the PUBLIC catalogue (getPublicModules) and
 * renders skills grouped by plugin suite. No auth, no installed-badge,
 * no detail-route link (cards link to source_url). Replaces the old
 * Phase 14 B getModulesV2 tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { ModulesCatalog } from "./ModulesCatalog";
import * as api from "../lib/api";
import type { PublicModuleSkill } from "../lib/api";

function skill(over: Partial<PublicModuleSkill> = {}): PublicModuleSkill {
  return {
    plugin: "uk-employment-legal",
    skill: "unfair-dismissal-screener",
    name: "Unfair Dismissal Screener",
    description: "Screens a dismissal against the s.94 ERA framework.",
    declared_capabilities: ["read", "model"],
    trust_posture: "first_party",
    source_url: "https://github.com/b1rdmania/claude-for-uk-legal/...",
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("ModulesCatalog (public marketplace)", () => {
  it("renders skills grouped by suite", async () => {
    vi.spyOn(api, "getPublicModules").mockResolvedValue({
      source: { repo: "b1rdmania/claude-for-uk-legal", ref: "abc123" },
      skills: [
        skill(),
        skill({
          plugin: "uk-litigation-legal",
          skill: "pre-motion",
          name: "Pre-Motion",
          description: "Adversarial premortem on a UK litigation matter.",
        }),
      ],
      broken: [],
    });

    render(<ModulesCatalog />);
    await waitFor(() => {
      expect(screen.getByText("Unfair Dismissal Screener")).toBeInTheDocument();
    });
    expect(screen.getByText("Pre-Motion")).toBeInTheDocument();
    // Suite sub-section headers (prettified plugin slugs).
    expect(screen.getByText("UK Employment")).toBeInTheDocument();
    expect(screen.getByText("UK Litigation")).toBeInTheDocument();
    expect(screen.getByText("2 skills")).toBeInTheDocument();
  });

  it("surfaces broken-manifest count", async () => {
    vi.spyOn(api, "getPublicModules").mockResolvedValue({
      source: { repo: "b1rdmania/claude-for-uk-legal", ref: "abc123" },
      skills: [skill()],
      broken: [{ plugin: "x", skill: "y", errors: [{ path: "/", message: "bad" }] }],
    });
    render(<ModulesCatalog />);
    await waitFor(() => {
      expect(screen.getByText(/1 with manifest issues/)).toBeInTheDocument();
    });
  });

  it("renders empty state", async () => {
    vi.spyOn(api, "getPublicModules").mockResolvedValue({
      source: { repo: null, ref: null },
      skills: [],
      broken: [],
    });
    render(<ModulesCatalog />);
    await waitFor(() => {
      expect(screen.getByText(/no skills in the catalogue/i)).toBeInTheDocument();
    });
  });

  it("surfaces a fetch error", async () => {
    vi.spyOn(api, "getPublicModules").mockRejectedValue(new Error("backend down"));
    render(<ModulesCatalog />);
    await waitFor(() => {
      expect(screen.getByText(/could not load the catalogue/i)).toBeInTheDocument();
    });
  });
});
