/**
 * drawerA11y — shared keyboard/focus behaviour for the off-canvas drawers.
 *
 * Two drawers use this: the workspace rail (SidebarView, mobile off-canvas
 * mode) and the public-pages Drawer. Both get the same treatment (WI-2):
 *   - focus moves to the first nav item when the drawer opens;
 *   - focus returns to whatever had it (the hamburger) when it closes;
 *   - Escape closes;
 *   - Tab cannot leave the drawer while open (first/last sentinel trap —
 *     no dependency, just two zero-size tab stops that wrap focus).
 *
 * The hook is inert while `open` is false, so SidebarView can keep calling
 * it in its static desktop mode without side effects.
 */

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute("data-focus-sentinel"));
}

export function useDrawerA11y({
  open,
  onClose,
  panelRef,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  // Keep the latest close callback without re-running the effect when the
  // caller passes a fresh closure each render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      // First nav item if there is one, otherwise the first focusable
      // (e.g. the close button) so keyboard users always land inside.
      const first =
        panel.querySelector<HTMLElement>("nav a, nav button") ??
        focusables(panel)[0];
      first?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Return focus to the trigger (the element focused at open time).
      restoreTo?.focus?.();
    };
  }, [open, panelRef]);
}

/**
 * Zero-size tab stop rendered as the first/last child of the drawer panel.
 * Tabbing onto it wraps focus to the opposite end of the panel, so Tab and
 * Shift+Tab cycle within the open drawer.
 */
export function FocusSentinel({
  panelRef,
  edge,
}: {
  panelRef: RefObject<HTMLElement | null>;
  edge: "start" | "end";
}) {
  return (
    <div
      tabIndex={0}
      data-focus-sentinel
      onFocus={() => {
        const panel = panelRef.current;
        if (!panel) return;
        const items = focusables(panel);
        const target = edge === "start" ? items[items.length - 1] : items[0];
        target?.focus();
      }}
    />
  );
}
