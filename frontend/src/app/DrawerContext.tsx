/**
 * DrawerContext — bridges matter-detail page state to the shell's TopBar
 * and Drawer.
 *
 * Pre-A0 this was App.tsx local state passed as props. With routed pages
 * the matter-detail component is rendered inside an `<Outlet />`, so it
 * has no direct way to push state up. This context replaces the prop
 * drilling without introducing a heavyweight store.
 */

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Matter } from "../lib/api";
import type { TabKey } from "../matter/tabs/types";

export type DrawerState = {
  drawerMatter: Matter | null;
  drawerTab: TabKey;
  setDrawerMatter: (m: Matter | null) => void;
  setDrawerTab: (t: TabKey) => void;
};

const DrawerContext = createContext<DrawerState | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [drawerMatter, setDrawerMatter] = useState<Matter | null>(null);
  const [drawerTab, setDrawerTab] = useState<TabKey>("assistant");
  const value = useMemo<DrawerState>(
    () => ({ drawerMatter, drawerTab, setDrawerMatter, setDrawerTab }),
    [drawerMatter, drawerTab],
  );
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerState {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used inside <DrawerProvider>");
  return ctx;
}
