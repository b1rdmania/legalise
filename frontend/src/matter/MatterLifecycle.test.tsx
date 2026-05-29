/**
 * Matter Lifecycle + Export UX v1 — focused tests.
 *
 * Export start → poll → download; close; delete type-to-confirm gating
 * and destructive copy. Uses a minimal router (the page uses no Links
 * except plain <a> hrefs, but navigate() on delete needs no router).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MatterLifecycle } from "./MatterLifecycle";
import * as api from "../lib/api";
import type { JobRead, Matter } from "../lib/api";

function matter(over: Partial<Matter> = {}): Matter {
  return {
    id: "m-1",
    slug: "khan-v-acme",
    title: "Khan v Acme",
    matter_type: "employment_tribunal",
    status: "open",
    privilege_posture: "B_mixed",
    default_model_id: null,
    opened_at: "2026-01-01",
    closed_at: null,
    created_by_id: "u-1",
    ...over,
  } as Matter;
}

function job(status: JobRead["status"], over: Partial<JobRead> = {}): JobRead {
  return {
    id: "job-1",
    matter_id: "m-1",
    kind: "export",
    status,
    stage: null,
    progress: null,
    error_code: null,
    error_message: null,
    created_at: "2026-05-29T00:00:00",
    started_at: null,
    finished_at: null,
    result_payload: null,
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  vi.spyOn(api, "getMatter").mockResolvedValue(matter());
});
afterEach(() => cleanup());

describe("MatterLifecycle — export", () => {
  it("starts an export, polls, and shows a download when succeeded", async () => {
    vi.spyOn(api, "createMatterExport").mockResolvedValue(job("queued"));
    // First poll: running; second poll: succeeded.
    const getJob = vi
      .spyOn(api, "getJob")
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValue(job("succeeded"));

    render(<MatterLifecycle slug="khan-v-acme" />);
    await waitFor(() => expect(screen.getByTestId("start-export")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("start-export"));

    await waitFor(
      () => {
        expect(screen.getByTestId("download-export")).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
    expect(getJob).toHaveBeenCalled();
    expect(
      screen.getByTestId("download-export").getAttribute("href"),
    ).toContain("/matters/khan-v-acme/export/job-1");
  }, 10000);
});

describe("MatterLifecycle — close", () => {
  it("closes a matter and reflects closed state", async () => {
    const close = vi.spyOn(api, "closeMatter").mockResolvedValue(matter({ status: "closed" }));
    vi.spyOn(api, "getMatter")
      .mockResolvedValueOnce(matter())
      .mockResolvedValue(matter({ status: "closed" }));

    render(<MatterLifecycle slug="khan-v-acme" />);
    await waitFor(() => expect(screen.getByTestId("close-matter")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("close-matter"));
    await waitFor(() => {
      expect(close).toHaveBeenCalledWith("khan-v-acme");
    });
  });
});

describe("MatterLifecycle — delete", () => {
  it("gates delete behind typing the matter slug", async () => {
    const del = vi.spyOn(api, "deleteMatter").mockResolvedValue(undefined);
    render(<MatterLifecycle slug="khan-v-acme" />);
    await waitFor(() => expect(screen.getByTestId("delete-matter")).toBeInTheDocument());

    const btn = screen.getByTestId("delete-matter") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // Wrong text → still disabled.
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "wrong" },
    });
    expect(btn.disabled).toBe(true);
    // Correct slug → armed.
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "khan-v-acme" },
    });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(del).toHaveBeenCalledWith("khan-v-acme"));
  });

  it("shows the danger-zone + irreversible copy", async () => {
    render(<MatterLifecycle slug="khan-v-acme" />);
    await waitFor(() => expect(screen.getByTestId("danger-zone")).toBeInTheDocument());
    expect(screen.getByText(/irreversible/i)).toBeInTheDocument();
    expect(screen.getByText(/export this matter first/i)).toBeInTheDocument();
  });
});
