import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { GenericSkillRunner } from "./GenericSkillRunner";
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
});
