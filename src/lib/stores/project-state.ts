import { create } from "zustand";

type ProjectStateStore = {
  activeProjectSlug: string | null;
  activeDesignSlug: string | null;
  setActiveProject: (projectSlug: string | null, designSlug?: string | null) => void;
  setActiveDesign: (designSlug: string | null) => void;
  reset: () => void;
};

const INITIAL_STATE = {
  activeProjectSlug: null,
  activeDesignSlug: null,
};

export const useProjectStateStore = create<ProjectStateStore>((set) => ({
  ...INITIAL_STATE,
  setActiveProject: (projectSlug, designSlug = null) =>
    set({
      activeProjectSlug: projectSlug,
      activeDesignSlug: designSlug,
    }),
  setActiveDesign: (designSlug) =>
    set((state) => ({
      ...state,
      activeDesignSlug: designSlug,
    })),
  reset: () => set(INITIAL_STATE),
}));
