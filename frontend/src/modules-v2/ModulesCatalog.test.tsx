/**
 * Module Standalone v1 — ModulesCatalog (integrations home) tests.
 *
 * Primary = v2 registry reference modules with workspace state; the
 * Lawve catalogue is the secondary browse + Review-&-add path. Mounts
 * the production router so the Links + auth context the page now
 * depends on resolve.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";

import { router as productionRouter } from "../router";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";
import type { LawveSkillRow, V2ManifestEntry } from "../lib/api";

function refModule(over: Partial<V2ManifestEntry> = {}): V2ManifestEntry {
  return {
    module_id: "examples.contract-review",
    source_kind: "v2",
    manifest: {
      name: "Contract Review",
      publisher: "legalise",
      capabilities: [
        {
          id: "review",
          reads: ["document.body.read"],
          writes: ["matter.artifact.write"],
        },
      ],
    },
    is_valid: true,
    validation_errors: [],
    ...over,
  };
}

function lawveRow(over: Partial<LawveSkillRow> = {}): LawveSkillRow {
  const slug = over.slug ?? "contract-review-anthropic";
  return {
    source: "lawve",
    repo: "lawve-ai/awesome-legal-skills",
    ref: "abc123sha",
    slug,
    name: slug,
    description: "A catalogue skill.",
    version: "2026.01.30",
    author_name: "Anthropic",
    license: "Apache-2.0",
    source_path: `./skills/${slug}`,
    lawve_url: `https://lawve.ai/en/skills/${slug}`,
    has_references: false,
    has_scripts: false,
    script_review_required: false,
    ...over,
  };
}

function mockLawveShelf(rows: LawveSkillRow[], directoryCount = 170) {
  vi.spyOn(api, "listLawveSkills").mockResolvedValue({
    source: "lawve",
    repo: "lawve-ai/awesome-legal-skills",
    ref: "abc123sha",
    skills: rows,
  });
  vi.spyOn(api, "getLawveDirectoryCount").mockResolvedValue({
    source: "lawve.ai",
    skills_url: "https://lawve.ai/en/skills",
    count: directoryCount,
  });
}

function mountAt(path = "/skills") {
  const router = createRouter({
    routeTree: productionRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ status: "ok", version: "", database: "", environment: "test" }),
        { status: 200 },
      ),
    ),
  ) as never;
  vi.spyOn(api, "getCurrentUser").mockResolvedValue({
    id: "u-1",
    email: "u@example.com",
    name: "u",
    role: "solicitor",
    plan: "free",
    default_model_id: null,
    default_privilege_posture: null,
    is_active: true,
    is_verified: true,
    is_superuser: false,
  });
});
afterEach(() => cleanup());

describe("ModulesCatalog — integrations home", () => {
  it("shows reference skills with workspace state + Add skill actions", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [refModule()],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "examples.contract-review",
        version: "0.2.1",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "structure_verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Contract Review")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("module-state-examples.contract-review"),
    ).toHaveTextContent(/added/i);
    // Permissions render as ink bands (P27 certificate anatomy); the
    // values live in the title attribute for hover/inspection.
    expect(screen.getAllByTitle("document.body.read").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("matter.artifact.write").length).toBeGreaterThan(0);
    expect(screen.getByText("Add skill")).toBeInTheDocument();
    expect(screen.getByText("Create skill")).toBeInTheDocument();
  });

  it("filters reference modules by search and workspace state", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [
        refModule(),
        refModule({
          module_id: "examples.pre-motion",
          manifest: {
            name: "Pre-Motion",
            publisher: "legalise",
            capabilities: [{ id: "analyse", reads: ["document.body.read"], writes: [] }],
          },
        }),
      ],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "examples.contract-review",
        version: "0.2.1",
        publisher: "legalise",
        visibility: "first_party",
        signature_status: "structure_verified",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
      },
    ]);

    mountAt();
    // PR 3 (blueprint §7) replaces the state dropdown with three tabs:
    // Added / Available / (Revoked, operator-only). Default lands
    // on Added; switching to Available exposes the not-yet-added
    // skills.
    await waitFor(() =>
      expect(screen.getByText("Contract Review")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Pre-Motion")).toBeNull();

    fireEvent.click(screen.getByTestId("skills-tab-available"));
    expect(screen.getByText("Pre-Motion")).toBeInTheDocument();
    expect(screen.queryByText("Contract Review")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search skills"), {
      target: { value: "zzzzz" },
    });
    expect(screen.getByText(/No skills match/)).toBeInTheDocument();
  });

  it("shows the demo path immediately without a sign-in wall", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Open demo")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("modules-signin-prompt")).toBeNull();
    expect(screen.getByText("1. Pick a skill")).toBeInTheDocument();
  });

  it("admin: shows 'Requested by your workspace' only when requests are pending", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      name: "admin",
      role: "qualified_solicitor",
      plan: "free",
      default_model_id: null,
      default_privilege_posture: null,
      is_active: true,
      is_verified: true,
      is_superuser: true,
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    vi.spyOn(api, "listModuleRequests").mockResolvedValue([
      {
        module_id: "lawve.contract-review",
        source: "lawve",
        requested_by: "u-2",
        requested_at: "2026-06-10T12:00:00+00:00",
      },
    ]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByTestId("skill-requests")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("skill-request-lawve.contract-review"),
    ).toBeInTheDocument();
    // Lawve requests deep-link into the importer by bare slug.
    const link = screen.getByText("Review & add →");
    expect(link.getAttribute("href")).toBe(
      "/skills/lawve?skill=contract-review",
    );
  });

  it("admin: no requests section when nothing is pending", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      name: "admin",
      role: "qualified_solicitor",
      plan: "free",
      default_model_id: null,
      default_privilege_posture: null,
      is_active: true,
      is_verified: true,
      is_superuser: true,
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    vi.spyOn(api, "listModuleRequests").mockResolvedValue([]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Add skill")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("skill-requests")).toBeNull();
  });

  it("Schedule B: shelf facets, Lawve attribution, and the gap strip", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    mockLawveShelf([
      lawveRow(),
      lawveRow({
        slug: "nda-review-jamie-tso",
        name: "nda-review-jamie-tso",
        author_name: "Jamie Tso",
        license: "AGPL-3.0",
      }),
    ]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByTestId("shelf-search")).toBeInTheDocument();
    });
    expect(screen.getByText("contract-review-anthropic")).toBeInTheDocument();
    expect(screen.getByTestId("shelf-count")).toHaveTextContent("2 of 2");

    // Quiet outbound attribution per row — catalogue dir name == slug.
    expect(
      screen
        .getByTestId("shelf-lawve-link-contract-review-anthropic")
        .getAttribute("href"),
    ).toBe("https://lawve.ai/en/skills/contract-review-anthropic");

    // Licence facet narrows the ledger.
    fireEvent.change(screen.getByTestId("shelf-license-filter"), {
      target: { value: "AGPL-3.0" },
    });
    expect(screen.queryByText("contract-review-anthropic")).toBeNull();
    expect(screen.getByText("nda-review-jamie-tso")).toBeInTheDocument();
    expect(screen.getByTestId("shelf-count")).toHaveTextContent("1 of 2");
    fireEvent.change(screen.getByTestId("shelf-license-filter"), {
      target: { value: "" },
    });

    // Author facet exists with the real authors.
    expect(screen.getByTestId("shelf-author-filter")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("shelf-author-filter"), {
      target: { value: "Jamie Tso" },
    });
    expect(screen.getByTestId("shelf-count")).toHaveTextContent("1 of 2");
    fireEvent.change(screen.getByTestId("shelf-author-filter"), {
      target: { value: "" },
    });

    // Ordering comes from the grouped ledger — no sort control.
    expect(screen.queryByTestId("shelf-sort")).toBeNull();

    // Search empties honestly.
    fireEvent.change(screen.getByTestId("shelf-search"), {
      target: { value: "zzzzz" },
    });
    expect(
      screen.getByText("No catalogue skills match that filter."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("shelf-search"), {
      target: { value: "" },
    });

    // The honest gap strip: directory size vs importable today.
    await waitFor(() => {
      expect(screen.getByTestId("shelf-gap-strip")).toBeInTheDocument();
    });
    expect(screen.getByTestId("shelf-gap-strip")).toHaveTextContent(
      "170 skills on Lawve · 2 importable here today",
    );
  });

  it("Schedule B: gap strip hides when the directory count fails", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    vi.spyOn(api, "listLawveSkills").mockResolvedValue({
      source: "lawve",
      repo: "lawve-ai/awesome-legal-skills",
      ref: "abc123sha",
      skills: [lawveRow()],
    });
    vi.spyOn(api, "getLawveDirectoryCount").mockRejectedValue(new Error("502"));

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("contract-review-anthropic")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("shelf-gap-strip")).toBeNull();
  });

  it("Schedule B: the shelf stocks for anonymous browsers too", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    mockLawveShelf([lawveRow()]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("contract-review-anthropic")).toBeInTheDocument();
    });
    expect(screen.getByTestId("shelf-search")).toBeInTheDocument();
  });

  it("tells the sources story: three routes, review rule, and the pulled-catalogue lede", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    mockLawveShelf([lawveRow(), lawveRow({ slug: "nda-review-jamie-tso", name: "nda-review-jamie-tso", author_name: "Jamie Tso", license: "AGPL-3.0" })]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByTestId("skill-sources")).toBeInTheDocument();
    });
    expect(screen.getByText("Where skills come from")).toBeInTheDocument();
    // Lawve is a text wordmark linking out — never a hotlinked logo.
    expect(screen.getByTestId("lawve-link").getAttribute("href")).toBe(
      "https://lawve.ai",
    );
    expect(screen.getByText("Any public GitHub repo")).toBeInTheDocument();
    expect(screen.getByText("Write your own")).toBeInTheDocument();
    expect(
      screen.getByText(/nothing runs on import/i),
    ).toBeInTheDocument();
    // The lede derives the count from the live feed.
    expect(screen.getByTestId("shelf-lede")).toHaveTextContent(
      "We've already pulled the Lawve catalogue — 2 skills to choose from below.",
    );
  });

  it("renders the catalogue as a grouped ledger: display names, descriptions, licence honesty, scripts marker", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    mockLawveShelf([
      lawveRow({
        slug: "nda-review-jamie-tso",
        name: "nda-review-jamie-tso",
        description: "Guide for reviewing incoming commercial NDAs.",
        author_name: "Jamie Tso",
        license: "AGPL-3.0",
      }),
      lawveRow({
        slug: "docx-processing-anthropic",
        name: "docx-processing-anthropic",
        description: "Document creation, editing, and analysis.",
        author_name: "Anthropic",
        license: null,
        has_scripts: true,
        script_review_required: true,
      }),
      lawveRow({
        slug: "politique-cookies-malik-taiar",
        name: "politique-cookies-malik-taiar",
        description: "Guide pour la rédaction de politiques cookies.",
        author_name: "Malik Taiar",
        license: "AGPL-3.0",
      }),
    ]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByTestId("shelf-group-contracts")).toBeInTheDocument();
    });
    // Legible derived names lead; the raw slug stays as secondary text.
    expect(screen.getByText("NDA review")).toBeInTheDocument();
    expect(screen.getByText("nda-review-jamie-tso")).toBeInTheDocument();
    // The one-line description finally shows.
    expect(
      screen.getByText("Guide for reviewing incoming commercial NDAs."),
    ).toBeInTheDocument();
    // Groups render in what-they-do order with French law last.
    expect(screen.getByTestId("shelf-group-documents")).toBeInTheDocument();
    const french = screen.getByTestId("shelf-group-french");
    expect(french).toHaveTextContent("French law (FR)");
    expect(french).toHaveTextContent(/England & Wales/);
    // Licence honesty + the scripts marker.
    expect(screen.getByText("unlicensed — check source")).toBeInTheDocument();
    expect(
      screen.getByText(/ships scripts — manual review/),
    ).toBeInTheDocument();
    // Filtering to AGPL hides the emptied Documents group with its header.
    fireEvent.change(screen.getByTestId("shelf-license-filter"), {
      target: { value: "AGPL-3.0" },
    });
    expect(screen.queryByTestId("shelf-group-documents")).toBeNull();
    expect(screen.getByTestId("shelf-group-contracts")).toBeInTheDocument();
  });

  it("hides the Workspace skills section entirely when the registry is empty", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    mockLawveShelf([lawveRow()]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Add skill")).toBeInTheDocument();
    });
    expect(screen.queryByText("Workspace skills")).toBeNull();
    expect(
      screen.queryByText("No reference skills in the registry yet."),
    ).toBeNull();
    // The library ↔ register pair is named consistently.
    expect(screen.getByText("My skills →")).toBeInTheDocument();
  });

  it("admin: a github-sourced request links the importer to its repo URL", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      name: "admin",
      role: "qualified_solicitor",
      plan: "free",
      default_model_id: null,
      default_privilege_posture: null,
      is_active: true,
      is_verified: true,
      is_superuser: true,
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    vi.spyOn(api, "listModuleRequests").mockResolvedValue([
      {
        module_id: "lawve.gh-skill",
        source: "github",
        source_url: "https://github.com/example/legal-skill",
        requested_by: "u-2",
        requested_at: "2026-06-10T12:00:00+00:00",
      },
    ]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByTestId("skill-requests")).toBeInTheDocument();
    });
    const link = screen.getByText("Review & add →");
    expect(link.getAttribute("href")).toBe(
      "/skills/lawve?github=https%3A%2F%2Fgithub.com%2Fexample%2Flegal-skill",
    );
  });

  it("renders without the retired open-skill-library browse section", async () => {
    vi.spyOn(api, "getModulesV2").mockResolvedValue({ modules: [], ui_slots: [] });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);

    mountAt();
    await waitFor(() => {
      expect(screen.getByText("Add skill")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("toggle-skills")).toBeNull();
  });
});
