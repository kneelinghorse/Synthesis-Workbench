import { create } from "zustand";
import type { DataContext } from "@/lib/engine/data-binding";

type DataContextState = {
  /** The active data context for binding resolution */
  context: DataContext;

  /** Monotonic revision counter for change detection */
  revision: number;

  /** Replace the entire data context */
  setContext: (context: DataContext) => void;

  /** Merge keys into the existing data context (shallow merge) */
  mergeContext: (partial: DataContext) => void;

  /** Get the current data context */
  getContext: () => DataContext;

  /** Reset to empty context */
  reset: () => void;
};

const INITIAL_STATE = {
  context: {} as DataContext,
  revision: 0,
};

export const useDataContextStore = create<DataContextState>((set, get) => ({
  ...INITIAL_STATE,

  setContext: (context) =>
    set((state) => ({
      context,
      revision: state.revision + 1,
    })),

  mergeContext: (partial) =>
    set((state) => ({
      context: { ...state.context, ...partial },
      revision: state.revision + 1,
    })),

  getContext: () => get().context,

  reset: () => set(INITIAL_STATE),
}));
