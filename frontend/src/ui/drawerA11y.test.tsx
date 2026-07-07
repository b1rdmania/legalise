/**
 * WI-2 — mobile drawer a11y (scrim, Escape, focus trap/return).
 *
 * Both off-canvas drawers share ui/drawerA11y.tsx:
 *   - SidebarView (the workspace rail's mobile drawer mode)
 *   - Drawer (public-pages nav)
 *
 * Pins: open moves focus inside (first nav item); Escape closes and
 * returns focus to the trigger; scrim click closes; Tab wraps at the
 * sentinels instead of escaping the drawer.
 */

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SidebarView } from "./SidebarView";
import { Drawer } from "./Drawer";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";
import type { Route } from "../lib/route";

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// SidebarView (workspace drawer)
// ---------------------------------------------------------------------------

function SidebarHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="trigger"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Open menu
      </button>
      <SidebarView
        globalItems={[
          { key: "matters", label: "Matters", href: "/matters" },
          { key: "library", label: "Skill library", href: "/skills" },
        ]}
        utilItems={[]}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

describe("SidebarView drawer a11y", () => {
  it("moves focus to the first nav item on open", () => {
    render(<SidebarHarness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    const first = screen.getByRole("link", { name: "Matters" });
    expect(document.activeElement).toBe(first);
  });

  it("exposes dialog semantics only while open", () => {
    render(<SidebarHarness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("trigger"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<SidebarHarness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on scrim click", async () => {
    render(<SidebarHarness />);
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("drawer-scrim"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("wraps Tab at the sentinels instead of leaving the drawer", () => {
    render(<SidebarHarness />);
    fireEvent.click(screen.getByTestId("trigger"));
    const sentinels = document.querySelectorAll("[data-focus-sentinel]");
    expect(sentinels).toHaveLength(2);
    // Tabbing past the end lands the end sentinel -> wraps to first item.
    fireEvent.focus(sentinels[1]);
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Matters" }),
    );
    // Shift-tabbing before the start lands the start sentinel -> wraps
    // to the last item.
    fireEvent.focus(sentinels[0]);
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Skill library" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Drawer (public-pages nav)
// ---------------------------------------------------------------------------

function PublicDrawerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="trigger"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Open menu
      </button>
      <Drawer
        route={{ name: "landing" } as Route}
        navOpen={open}
        setNavOpen={setOpen}
        matter={null}
        health={null}
      />
    </>
  );
}

function renderPublicDrawer() {
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);
  return render(
    <AuthProvider>
      <PublicDrawerHarness />
    </AuthProvider>,
  );
}

describe("public Drawer a11y", () => {
  it("moves focus to the first nav item on open", () => {
    renderPublicDrawer();
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Demo" }),
    );
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderPublicDrawer();
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on scrim click", async () => {
    renderPublicDrawer();
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("drawer-scrim"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("wraps Tab at the sentinels", () => {
    renderPublicDrawer();
    fireEvent.click(screen.getByTestId("trigger"));
    const sentinels = document.querySelectorAll("[data-focus-sentinel]");
    expect(sentinels).toHaveLength(2);
    fireEvent.focus(sentinels[1]);
    // Wraps to the first focusable inside the panel (the close button).
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close menu" }),
    );
  });
});
