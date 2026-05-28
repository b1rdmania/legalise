/**
 * Module Standalone v1 — CreateModule (validate-and-explain) tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CreateModule } from "./CreateModule";
import * as api from "../lib/api";

beforeEach(() => vi.restoreAllMocks());
afterEach(() => cleanup());

describe("CreateModule", () => {
  it("validates a manifest and reports OK", async () => {
    const spy = vi
      .spyOn(api, "validateManifest")
      .mockResolvedValue({ valid: true, errors: [] });

    render(<CreateModule />);
    fireEvent.change(screen.getByTestId("manifest-input"), {
      target: { value: '{"id":"x"}' },
    });
    fireEvent.click(screen.getByText("Validate"));
    await waitFor(() => {
      expect(screen.getByTestId("validate-ok")).toBeInTheDocument();
    });
    expect(spy).toHaveBeenCalledWith({ id: "x" });
  });

  it("surfaces validation errors with path + message", async () => {
    vi.spyOn(api, "validateManifest").mockResolvedValue({
      valid: false,
      errors: [{ path: "capabilities[0].id", message: "is required" }],
    });

    render(<CreateModule />);
    fireEvent.change(screen.getByTestId("manifest-input"), {
      target: { value: "{}" },
    });
    fireEvent.click(screen.getByText("Validate"));
    await waitFor(() => {
      expect(screen.getByTestId("validate-errors")).toBeInTheDocument();
    });
    expect(screen.getByText(/capabilities\[0\]\.id/)).toBeInTheDocument();
    expect(screen.getByText(/is required/)).toBeInTheDocument();
  });

  it("rejects non-JSON before calling the API", async () => {
    const spy = vi.spyOn(api, "validateManifest");
    render(<CreateModule />);
    fireEvent.change(screen.getByTestId("manifest-input"), {
      target: { value: "not json" },
    });
    fireEvent.click(screen.getByText("Validate"));
    await waitFor(() => {
      expect(screen.getByTestId("validate-parse-error")).toBeInTheDocument();
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
