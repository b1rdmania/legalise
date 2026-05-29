/**
 * Lawve Skill Importer v1 — LawveImport focused tests.
 *
 * List/search render; detail shows provenance + the scripts manual-review
 * flag; convert shows the draft trust-state + warnings + manifest, and a
 * prompt-only skill is honestly NOT installable (no install button).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LawveImport } from "./LawveImport";
import * as api from "../lib/api";
import type { LawveDraftResult, LawveSkillDetail, LawveSkillRow } from "../lib/api";

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
    render(<LawveImport />);
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
    render(<LawveImport />);
    await waitFor(() => expect(screen.getByTestId("lawve-card-office-processor")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-office-processor"));
    await waitFor(() => expect(screen.getByTestId("lawve-detail")).toBeInTheDocument());
    expect(screen.getByTestId("lawve-script-flag")).toHaveTextContent(/not imported or executed/i);
  });

  it("converts a prompt-only skill to a valid draft (Ready to sign, no install button)", async () => {
    vi.spyOn(api, "getLawveSkill").mockResolvedValue(detail());
    vi.spyOn(api, "draftLawveModule").mockResolvedValue(draft());
    render(<LawveImport />);
    await waitFor(() => expect(screen.getByTestId("lawve-card-contract-review-anthropic")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-contract-review-anthropic"));
    await waitFor(() => expect(screen.getByTestId("convert-draft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("convert-draft"));
    await waitFor(() => expect(screen.getByTestId("draft-review")).toBeInTheDocument());
    expect(screen.getByTestId("draft-trust-state")).toHaveTextContent(/ready to sign/i);
    // Manifest carries the prompt runtime.
    expect(screen.getByTestId("draft-review")).toHaveTextContent(/"runtime": "prompt"/);
    // No install affordance — sign/install only through the ceremony.
    expect(screen.queryByText(/^install$/i)).toBeNull();
    expect(screen.getByText(/Download manifest/)).toBeInTheDocument();
  });

  it("shows Needs licence review when an AGPL warning is present", async () => {
    vi.spyOn(api, "getLawveSkill").mockResolvedValue(detail());
    vi.spyOn(api, "draftLawveModule").mockResolvedValue(
      draft({ warnings: [{ code: "license_review", message: "AGPL — review before install." }] }),
    );
    render(<LawveImport />);
    await waitFor(() => expect(screen.getByTestId("lawve-card-contract-review-anthropic")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lawve-card-contract-review-anthropic"));
    await waitFor(() => expect(screen.getByTestId("convert-draft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("convert-draft"));
    await waitFor(() => expect(screen.getByTestId("draft-trust-state")).toHaveTextContent(/needs licence review/i));
  });
});
