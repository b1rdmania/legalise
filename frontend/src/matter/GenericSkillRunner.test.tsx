import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { artifactIdsFromResult, GenericSkillRunner } from "./GenericSkillRunner";
import type { RunnableMatterSkill } from "./skillRunnerModel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const baseSkill: RunnableMatterSkill = {
  moduleId: "demo.guided-skill",
  capabilityId: "summarise",
  title: "Plain-English Summary",
  description: "Summarises a document.",
  defaultRequest: "Summarise {filename}.",
  inputFields: [],
  reads: ["document.body.read"],
  writes: ["matter.artifact.write"],
  modelAccess: "required",
  signatureStatus: "verified",
  sourceKind: "v2",
};

const docs = [
  {
    id: "doc-1",
    matter_id: "m-1",
    filename: "witness.txt",
    mime_type: "text/plain",
    size_bytes: 200,
    sha256: "sha",
    tag: "demo",
    from_disclosure: false,
    uploaded_at: "2026-01-01T00:00:00",
    uploaded_by_id: "u-1",
  },
];

function renderRunner(skill: RunnableMatterSkill = baseSkill) {
  return render(
    <GenericSkillRunner slug="khan-v-acme" skill={skill} documents={docs} compact />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GenericSkillRunner", () => {
  it("extracts all artifact ids from a generic invocation result", () => {
    expect(
      artifactIdsFromResult({
        artifact_id: "primary",
        motion_artifact_id: "motion",
        evidence_artifact_id: "evidence",
        duplicate_artifact_id: "motion",
        not_artifact_idish: "ignored",
      }),
    ).toEqual(["primary", "motion", "evidence"]);
  });

  it("uses manifest default_request instead of inventing skill copy", () => {
    renderRunner();

    expect(screen.getByDisplayValue("Summarise witness.txt.")).toBeInTheDocument();
  });

  it("falls back to neutral document copy when no manifest default_request exists", () => {
    renderRunner({ ...baseSkill, defaultRequest: null });

    expect(screen.getByDisplayValue("Run this skill on the selected document.")).toBeInTheDocument();
  });

  it("can close a completed run from the inline runner", async () => {
    vi.spyOn(api, "invokeCapability").mockResolvedValue({
      invocation_id: "inv-1",
      result: { artifact_id: "artifact-1" },
    } as never);
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "artifact-1",
      kind: "skill_response",
      payload: { output: "The witness statement says X." },
      invocation_id: "inv-1",
      created_at: "2026-01-01T00:00:00",
    } as never);
    renderRunner();

    fireEvent.click(screen.getByTestId("generic-run-demo.guided-skill-summarise"));

    expect(await screen.findByTestId("generic-runner-result")).toBeInTheDocument();
    expect(screen.getByText(/The witness statement says X/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Close run/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("generic-runner-result")).toBeNull();
    });
  });

  it("renders manifest string-enum fields and sends them as args", async () => {
    const invoke = vi.spyOn(api, "invokeCapability").mockResolvedValue({
      invocation_id: "inv-1",
      result: { artifact_id: "artifact-1" },
    } as never);
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "artifact-1",
      kind: "skill_response",
      payload: { output: "Issue list output." },
      invocation_id: "inv-1",
      created_at: "2026-01-01T00:00:00",
    } as never);

    renderRunner({
      ...baseSkill,
      inputFields: [
        {
          key: "style",
          label: "Style",
          description: null,
          kind: "select",
          options: ["Plain English", "Issue list"],
          defaultValue: "Plain English",
          required: true,
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/Style/i), {
      target: { value: "Issue list" },
    });
    fireEvent.click(screen.getByTestId("generic-run-demo.guided-skill-summarise"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("khan-v-acme", {
        module_id: "demo.guided-skill",
        capability_id: "summarise",
        args: {
          input: "Summarise witness.txt.",
          document_id: "doc-1",
          style: "Issue list",
        },
      });
    });
  });

  it("renders every artifact id returned by a native-style result", async () => {
    vi.spyOn(api, "invokeCapability").mockResolvedValue({
      invocation_id: "inv-1",
      result: {
        motion_artifact_id: "motion-1",
        evidence_artifact_id: "evidence-1",
      },
    } as never);
    const read = vi.spyOn(api, "readArtifact");
    read.mockResolvedValueOnce({
      id: "motion-1",
      kind: "motion_draft",
      payload: { markdown: "# Draft motion" },
      invocation_id: "inv-1",
      created_at: "2026-01-01T00:00:00",
    } as never);
    read.mockResolvedValueOnce({
      id: "evidence-1",
      kind: "evidence_list",
      payload: { evidence: [{ document_id: "doc-1", relevance: "high" }] },
      invocation_id: "inv-1",
      created_at: "2026-01-01T00:00:00",
    } as never);

    renderRunner();
    fireEvent.click(screen.getByTestId("generic-run-demo.guided-skill-summarise"));

    expect(await screen.findByText("2 outputs written")).toBeInTheDocument();
    expect(screen.getByTestId("motion-draft-view")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-list-view")).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith("khan-v-acme", "motion-1");
    expect(read).toHaveBeenCalledWith("khan-v-acme", "evidence-1");
  });
});
