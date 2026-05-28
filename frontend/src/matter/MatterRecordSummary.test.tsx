import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatterRecordSummary } from "./MatterRecordSummary";
import type { AuditEntry, Matter, MatterDocument } from "../lib/api";

afterEach(() => {
  cleanup();
});

const MATTER: Matter = {
  id: "matter-1",
  slug: "khan-v-acme",
  title: "Khan v Acme",
  matter_type: "employment",
  cause: "unfair_dismissal",
  status: "open",
  case_theory: null,
  pivot_fact: null,
  privilege_posture: "B_mixed",
  default_model_id: "stub-echo",
  facts: {},
  opened_at: "2026-05-20T12:00:00",
  closed_at: null,
  retention_until: null,
  created_by_id: "user-1",
};

const DOCS: MatterDocument[] = [
  {
    id: "doc-1",
    matter_id: "matter-1",
    filename: "contract.pdf",
    mime_type: "application/pdf",
    size_bytes: 123,
    sha256: "abc",
    tag: null,
    from_disclosure: false,
    uploaded_at: "2026-05-20T12:00:00",
    uploaded_by_id: "user-1",
  },
  {
    id: "doc-2",
    matter_id: "matter-1",
    filename: "letter.pdf",
    mime_type: "application/pdf",
    size_bytes: 456,
    sha256: "def",
    tag: null,
    from_disclosure: false,
    uploaded_at: "2026-05-20T12:00:00",
    uploaded_by_id: "user-1",
  },
];

const AUDIT: AuditEntry[] = [
  {
    id: "audit-1",
    timestamp: "2026-05-20T12:00:00",
    matter_id: "matter-1",
    actor_id: "user-1",
    action: "module.capability.completed",
    module: "examples.contract-review",
    resource_type: "module",
    resource_id: "examples.contract-review",
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: null,
    payload: {},
  },
];

describe("MatterRecordSummary", () => {
  it("renders the record summary with counts and posture", () => {
    render(
      <MatterRecordSummary
        matter={MATTER}
        docs={DOCS}
        audit={AUDIT}
        onSelectTab={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Matter record summary")).toBeInTheDocument();
    expect(screen.getByText("Khan v Acme")).toBeInTheDocument();
    expect(screen.getByText("Mixed")).toBeInTheDocument();
    expect(screen.getByText("2 docs")).toBeInTheDocument();
    expect(screen.getByText("1 row")).toBeInTheDocument();
    expect(screen.getByText("2026-05-20")).toBeInTheDocument();
  });

  it("links the matter loop to tabs, artifacts, and audit", () => {
    const onSelectTab = vi.fn();
    render(
      <MatterRecordSummary
        matter={MATTER}
        docs={DOCS}
        audit={AUDIT}
        onSelectTab={onSelectTab}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    fireEvent.click(screen.getByRole("button", { name: "Workflows" }));

    expect(onSelectTab).toHaveBeenNthCalledWith(1, "documents");
    expect(onSelectTab).toHaveBeenNthCalledWith(2, "workflows");
    expect(screen.getByRole("link", { name: "Artifacts" })).toHaveAttribute(
      "href",
      "/matters/khan-v-acme/artifacts",
    );
    expect(screen.getByRole("link", { name: "Audit trail" })).toHaveAttribute(
      "href",
      "/matters/khan-v-acme/audit",
    );
  });
});
