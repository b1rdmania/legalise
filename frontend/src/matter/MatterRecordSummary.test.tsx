import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
  required_provider: null,
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
  it("renders the slim record header with title, slug, posture and counts", () => {
    render(<MatterRecordSummary matter={MATTER} docs={DOCS} audit={AUDIT} />);

    // Phase 17-IA-B: slim header (aria-label "Matter record"), canonical
    // tokens, no stat-strip / coaching box / action buttons (nav moved
    // to the global sidebar).
    expect(screen.getByLabelText("Matter record")).toBeInTheDocument();
    expect(screen.getByText("Khan v Acme")).toBeInTheDocument();
    expect(screen.getByText("khan-v-acme")).toBeInTheDocument();
    expect(screen.getByText("Mixed")).toBeInTheDocument();
    // Document + audit counts render as bare numbers in the fact list.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2026-05-20")).toBeInTheDocument();
  });

  it("no longer renders nav action buttons (sidebar owns nav)", () => {
    render(<MatterRecordSummary matter={MATTER} docs={DOCS} audit={AUDIT} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link", { name: "Artifacts" })).toBeNull();
  });
});
