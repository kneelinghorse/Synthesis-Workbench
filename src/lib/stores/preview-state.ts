import { create } from "zustand";

export const PREVIEW_THEMES = ["base", "dark", "hc"] as const;
export type PreviewThemeId = (typeof PREVIEW_THEMES)[number];
export const PREVIEW_CONNECTION_STATUSES = [
  "connecting",
  "connected",
  "disconnected",
  "error",
] as const;
export type PreviewConnectionStatus =
  (typeof PREVIEW_CONNECTION_STATUSES)[number];
export const PREVIEW_FOUNDRY_STATUSES = [
  "live",
  "dry-run",
  "offline",
] as const;
export type PreviewFoundryStatus = (typeof PREVIEW_FOUNDRY_STATUSES)[number];

type PreviewState = {
  html: string;
  theme: PreviewThemeId;
  connectionStatus: PreviewConnectionStatus;
  foundryStatus: PreviewFoundryStatus;
  lastUpdatedAt: string | null;
  setHtml: (html: string) => void;
  setTheme: (theme: PreviewThemeId) => void;
  setConnectionStatus: (connectionStatus: PreviewConnectionStatus) => void;
  setFoundryStatus: (foundryStatus: PreviewFoundryStatus) => void;
  reset: () => void;
};

const INITIAL_STATE = {
  html: "",
  theme: "base" as PreviewThemeId,
  connectionStatus: "disconnected" as PreviewConnectionStatus,
  foundryStatus: "offline" as PreviewFoundryStatus,
  lastUpdatedAt: null,
};

export const usePreviewStateStore = create<PreviewState>((set) => ({
  ...INITIAL_STATE,
  setHtml: (html) =>
    set({
      html,
      lastUpdatedAt: new Date().toISOString(),
    }),
  setTheme: (theme) =>
    set({
      theme,
    }),
  setConnectionStatus: (connectionStatus) =>
    set({
      connectionStatus,
    }),
  setFoundryStatus: (foundryStatus) =>
    set({
      foundryStatus,
    }),
  reset: () => set(INITIAL_STATE),
}));

export const resetPreviewState = () => {
  usePreviewStateStore.setState(INITIAL_STATE);
};
