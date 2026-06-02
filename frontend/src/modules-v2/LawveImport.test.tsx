/**
 * Lawve Skill Importer v1 + External Skills Loop v1 — LawveImport tests.
 *
 * List/search render; detail shows provenance + the scripts manual-review
 * flag; convert shows the draft trust-state + warnings + manifest. Loop v1:
 * a valid draft offers a one-click "Install this draft" CTA to admins
 * (posts the inline manifest + navigates to the trust ceremony) and a
 * softened "ask an administrator" note to non-admins — never a dead button.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { LawveImport } from "./LawveImport";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";
import type { LawveDraftResult, LawveSkillDetail, LawveSkillRow } from "../lib/api";

function mountLawve() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const lawveRoute = createRoute({
    getParentRoute: () => root,
    path: "/skills/lawve",
    component: () => <LawveImport />,
  });
  const ceremonyStub = createRoute({
    getParentRoute: () => root,
    path: "/skills/install/$ceremonyId",
    component: () => <div data-testid="ceremony-stub" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([lawveRoute, ceremonyStub]),
    history: createMemoryHistory({ initialEntries: ["/skills/lawve"] }),
  });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function mockUser(isAdmin: boolean) {
  vi.spyOn(api, "getCurrentUser").mockResolvedValue({
    id: "u-1",
    email: isAdmin ? "admin@example.com" : "user@example.com",
    role: "qualified_solicitor",
    is_superuser: isAdmin,
  } as never);
}

function row(over: Partial<LawveSkillRow> = {}): LawveSkillRow {
  return {
    source: "lawve",
    repo: "lawve-ai/awesome-legal-skills",
    ref: "abc123sha",
    slug: "contract-review-anthropic",
    name: "Contract Review",
    description: "Review contracts.",
    version: "2026.01.30",
    author_name: "Anthropic",
    license: "Apache-2.0",
    source_path: "./skills/contract-review-anthropic",
    has_references: true,
    has_scripts: false,
    script_review_required: false,
    ...over,
  };
}

function detail(over: Partial<LawveSkillDetail> = {}): LawveSkillDetail {
  return {
    ...row(over),
    skill_markdown: "---\nname: x\n---\nbody",
    frontmatter: {},
    references: ["skills/contract-review-anthropic/references/x.md"],
    scripts: [],
    license_text: null,
    provenance: {
      repo_url: "https://github.com/lawve-ai/awesome-legal-skills",
      ref: "abc123sha",
      source_path: "./skills/contract-review-anthropic",
    },
    ...over,
  } as LawveSkillDetail;
}

function draft(over: Partial<LawveDraftResult> = {}): LawveDraftResult {
  return {
    manifest: {
      schema_version: "2.0.0",
      id: "lawve.contract-review-anthropic",
      runtime: "prompt",
      entrypoint: { prompt_source: "manifest", instructions: "Review the contract." },
      capabilities: [],
    },
    valid: true,
    errors: [],
    warnings: [
      { code: "references_present", message: "References are source material, not runtime code." },
    ],
    source_provenance: { repo_url: "x", ref: "abc123sha", source_path: "y" },
    next_steps: ["Review permissions", "Sign + install via the ceremony"],
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockUser(true);
  vi.spyOn(api, "listLawveSkills").mockResolvedValue({
    source: "lawve",
    repo: "lawve-ai/awesome-legal-skills",
    ref: "abc123sha",
    skills: [
      row(),
      row({ slug: "office-processor", name: "Office Processor", has_scripts: true, script_review_required: true, license: "Proprietary" }),
    ],
  });
});
afterEach(() => cleanup());

describe("LawveImport", () => {
  it("lists skills and filters by search", async () => {
    mountLawve();
    await waitFor(() => expect(screen.getByTestId("lawve-card-contract-review-anthropic")).toBeInTheDocument());
    expect(screen.getByTestId("lawve-card-office-processor")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("lawve-search"), { target: { value: "office" } });
    await waitFor(() => {
      expect(screen.queryByTestId("lawve-card-contract-review-anthropic")).toBeNull();
    });
    expect(screen.getByTestId("lawve-card-office-processor")).toBeInTheDocument();
  });

  it("opens a scripted skill and shows the non-execution flag", async () => {
    vi.spyOn(api, "getLawveSkill").mockResolvedValue(
      detail({ slug: "office-processor", name: "Office Processor", has_scripts: true, scripts: ["skills/office-processor/scripts/run.py"] }),
    );
    mountLawve();
    await waitFor(() => expect(screen.getByTestId("lawve-card-office-processor")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-office-processor"));
    await waitFor(() => expect(screen.getByTestId("lawve-detail")).toBeInTheDocument());
    expect(screen.getByTestId("lawve-script-flag")).toHaveTextContent(/not imported or executed/i);
  });

  it("converts a prompt-only skill to a valid draft (Ready to sign, no install button)", async () => {
    vi.spyOn(api, "getLawveSkill").mockResolvedValue(detail());
    vi.spyOn(api, "draftLawveModule").mockResolvedValue(draft());
    mountLawve();
    await waitFor(() => expect(screen.getByTestId("lawve-card-contract-review-anthropic")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-contract-review-anthropic"));
    await waitFor(() => expect(screen.getByTestId("convert-draft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("convert-draft"));
    await waitFor(() => expect(screen.getByTestId("draft-review")).toBeInTheDocument());
    expect(screen.getByTestId("draft-trust-state")).toHaveTextContent(/ready to sign/i);
    // Manifest carries the prompt runtime.
    expect(screen.getByTestId("draft-review")).toHaveTextContent(/"runtime": "prompt"/);
    expect(screen.getByText(/Download manifest/)).toBeInTheDocument();
    // Continuity: a valid draft is installable by an admin (default user).
    expect(screen.getByTestId("install-draft")).toBeInTheDocument();
  });

  it("installs a valid draft: posts the inline manifest + navigates to the ceremony", async () => {
    vi.spyOn(api, "getLawveSkill").mockResolvedValue(detail());
    vi.spyOn(api, "draftLawveModule").mockResolvedValue(draft());
    const startInstall = vi
      .spyOn(api, "startInstall")
      .mockResolvedValue({ ceremony_id: "cer-123" } as never);
    mountLawve();
    await waitFor(() => expect(screen.getByTestId("lawve-card-contract-review-anthropic")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-contract-review-anthropic"));
    await waitFor(() => expect(screen.getByTestId("convert-draft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("convert-draft"));
    await waitFor(() => expect(screen.getByTestId("install-draft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("install-draft"));
    await waitFor(() => {
      expect(startInstall).toHaveBeenCalledWith(
        expect.objectContaining({ source: "manifest" }),
      );
    });
    // Navigated to the trust ceremony stub.
    await waitFor(() => expect(screen.getByTestId("ceremony-stub")).toBeInTheDocument());
    const arg = startInstall.mock.calls[0][0] as { manifest?: { runtime?: string } };
    expect(arg.manifest?.runtime).toBe("prompt");
  });

  it("hides the install button for non-admins and shows an ask-an-admin note", async () => {
    mockUser(false);
    vi.spyOn(api, "getLawveSkill").mockResolvedValue(detail());
    vi.spyOn(api, "draftLawveModule").mockResolvedValue(draft());
    mountLawve();
    await waitFor(() => expect(screen.getByTestId("lawve-card-contract-review-anthropic")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-contract-review-anthropic"));
    await waitFor(() => expect(screen.getByTestId("convert-draft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("convert-draft"));
    await waitFor(() => expect(screen.getByTestId("install-admin-note")).toBeInTheDocument());
    expect(screen.queryByTestId("install-draft")).toBeNull();
  });

  it("shows Needs licence review when an AGPL warning is present", async () => {
    vi.spyOn(api, "getLawveSkill").mockResolvedValue(detail());
    vi.spyOn(api, "draftLawveModule").mockResolvedValue(
      draft({ warnings: [{ code: "license_review", message: "AGPL — review before install." }] }),
    );
    mountLawve();
    await waitFor(() => expect(screen.getByTestId("lawve-card-contract-review-anthropic")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-contract-review-anthropic"));
    await waitFor(() => expect(screen.getByTestId("convert-draft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("convert-draft"));
    await waitFor(() => expect(screen.getByTestId("draft-trust-state")).toHaveTextContent(/needs licence review/i));
  });
});
