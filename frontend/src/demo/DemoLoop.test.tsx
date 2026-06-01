/**
 * Guided Demo Loop v1 — DemoLoop walkthrough test.
 *
 * Drives the stepped flow with mocked endpoints: ensure → run → artifact
 * renders → request review → review note + Activity Trail link. Proves the
 * page wires the real client calls and surfaces the separation-of-duties
 * note (it does not fake a self-approval).
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

import { DemoLoop } from "./DemoLoop";
import * as api from "../lib/api";

function mountDemo() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const demoRoute = createRoute({
    getParentRoute: () => root,
    path: "/demo-loop",
    component: () => <DemoLoop />,
  });
  const tabStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/$tab",
    component: () => <div data-testid="tab-stub" />,
  });
  const auditStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/audit",
    validateSearch: (s: Record<string, unknown>) => ({
      invocation_id: typeof s.invocation_id === "string" ? s.invocation_id : undefined,
    }),
    component: () => <div data-testid="audit-stub" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([demoRoute, tabStub, auditStub]),
    history: createMemoryHistory({ initialEntries: ["/demo-loop"] }),
  });
  return render(<RouterProvider router={router} />);
}

const HANDLES = {
  matter_slug: "guided-demo-loop",
  matter_title: "Guided Demo — Employment Tribunal (keyless)",
  module_id: "demo.guided-skill",
  capability_id: "summarise",
  document_id: "doc-1",
  document_filename: "demo-employment-note.txt",
  model_id: "stub-echo",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "ensureGuidedLoop").mockResolvedValue(HANDLES as never);
});
afterEach(() => cleanup());

describe("DemoLoop", () => {
  it("walks ensure → run → artifact → request review → trail", async () => {
    vi.spyOn(api, "invokeCapability").mockResolvedValue({
      invocation_id: "inv-1",
      module_id: HANDLES.module_id,
      capability_id: HANDLES.capability_id,
      matter_id: "m-1",
      result: { artifact_id: "art-1", artifact_kind: "skill_response", output_chars: 42 },
    } as never);
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: HANDLES.module_id,
      capability_id: HANDLES.capability_id,
      invocation_id: "inv-1",
      kind: "skill_response",
      created_by_id: "u-1",
      created_at: "2026-05-29T12:00:00",
      size_bytes: 100,
      payload: { output: "Three bullet summary.", model_id: "stub-echo", input: "Summarise this document." },
    } as never);
    vi.spyOn(api, "requestReview").mockResolvedValue({ id: "rev-1", state: "pending" } as never);

    mountDemo();

    // Ensure resolved → banner + run button.
    await waitFor(() => expect(screen.getByTestId("demo-banner")).toBeInTheDocument());
    expect(screen.getByTestId("demo-banner")).toHaveTextContent(/stub-echo/);
    const runBtn = await screen.findByTestId("demo-run");

    // Trust & Review card present from the start, with the three facts and View proof CTA.
    const card = screen.getByTestId("trust-review-card");
    expect(card).toHaveTextContent(/Audit trail/);
    expect(card).toHaveTextContent(/Human review/);
    expect(card).toHaveTextContent(/Source visibility/);
    expect(card).not.toHaveTextContent(/verified/i);
    const viewProof = screen.getByTestId("trust-review-view-proof");
    expect(viewProof).toBeInTheDocument();

    // Clicking View proof opens the four-question Proof drawer (pre-run shape).
    fireEvent.click(viewProof);
    const drawer = screen.getByTestId("proof-drawer");
    expect(drawer).toHaveTextContent(/Proof record/);
    expect(drawer).not.toHaveTextContent(/Verified proof/i);
    expect(drawer).toHaveTextContent(/What did it see\?/);
    expect(drawer).toHaveTextContent(/Under what protection\?/);
    expect(drawer).toHaveTextContent(/What did it produce\?/);
    expect(drawer).toHaveTextContent(/Who remains accountable\?/);
    expect(drawer).toHaveTextContent(/Run not yet executed/);
    // Pre-run: no invocation id yet, so the Activity Trail link is absent.
    expect(screen.queryByTestId("proof-drawer-open-trail")).toBeNull();
    fireEvent.click(screen.getByTestId("proof-drawer-close"));
    expect(screen.queryByTestId("proof-drawer")).toBeNull();

    // Run → artifact renders via ArtifactPreview skill_response branch.
    fireEvent.click(runBtn);
    await waitFor(() => expect(screen.getByTestId("demo-artifact")).toBeInTheDocument());
    expect(screen.getByTestId("skill-response-view")).toBeInTheDocument();
    expect(screen.getByText(/Three bullet summary/)).toBeInTheDocument();

    // Request review → separation-of-duties note + Activity Trail link.
    fireEvent.click(screen.getByTestId("demo-request-review"));
    await waitFor(() => expect(screen.getByTestId("demo-review-note")).toBeInTheDocument());
    expect(screen.getByTestId("demo-review-note")).toHaveTextContent(/cannot approve their own/i);
    expect(screen.getByTestId("demo-open-trail")).toBeInTheDocument();
    expect(api.requestReview).toHaveBeenCalledWith("guided-demo-loop", "art-1");

    // Post-review: re-open the Proof drawer. The artifact + invocation id
    // are now in scope, so What did it produce? renders the kind + output
    // preview, Who remains accountable? notes review requested, and the
    // deeper "Open full Activity Trail" link is present.
    fireEvent.click(screen.getByTestId("trust-review-view-proof"));
    const postRunDrawer = screen.getByTestId("proof-drawer");
    expect(postRunDrawer).toHaveTextContent(/skill_response/);
    expect(postRunDrawer).toHaveTextContent(/Three bullet summary/);
    expect(postRunDrawer).toHaveTextContent(/Review/);
    expect(postRunDrawer).toHaveTextContent(/separate reviewer/i);
    expect(screen.getByTestId("proof-drawer-open-trail")).toBeInTheDocument();
  });

  it("surfaces an error if the run fails", async () => {
    vi.spyOn(api, "invokeCapability").mockRejectedValue(new Error("boom"));
    mountDemo();
    const runBtn = await screen.findByTestId("demo-run");
    fireEvent.click(runBtn);
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument());
    // Still on the run step (no artifact).
    expect(screen.queryByTestId("demo-artifact")).toBeNull();
  });
});
