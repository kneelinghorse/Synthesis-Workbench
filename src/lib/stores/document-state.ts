import { create } from "zustand";
import type { DesignDocument, DesignNode, LayoutNode } from "@/types/document-model";
import { isComponentNode, isLayoutNode } from "@/types/document-model";
import type { CompositionError } from "@/lib/engine/composition-renderer";

type CompositionStatus = "idle" | "rendering" | "success" | "error";

type DocumentState = {
  /** The active design document, or null if none loaded */
  document: DesignDocument | null;

  /** Composition rendering status */
  compositionStatus: CompositionStatus;

  /** Errors from the most recent composition render */
  compositionErrors: CompositionError[];

  /** Monotonic counter incremented on every document change (drives re-renders) */
  revision: number;

  /** Monotonic counter incremented when the user requests a manual retry */
  retryNonce: number;

  /** Set or replace the active design document */
  setDocument: (doc: DesignDocument | null) => void;

  /** Update the composition status and errors */
  setCompositionState: (
    status: CompositionStatus,
    errors?: CompositionError[],
  ) => void;

  /** Request a fresh render attempt without editing the document */
  requestRetry: () => void;

  /** Remove a failed component from the document and re-render the remaining layout */
  skipComponent: (componentId: string) => void;

  /** Clear document and reset all state */
  reset: () => void;
};

const EMPTY_LAYOUT_ROOT: LayoutNode = {
  nodeType: "layout",
  layout: { type: "stack", gap: 0 },
  children: [],
};

const removeComponentById = (
  node: DesignNode,
  componentId: string
): DesignNode | null => {
  if (isComponentNode(node)) {
    return node.id === componentId ? null : node;
  }

  if (isLayoutNode(node)) {
    const children = node.children
      .map((child) => removeComponentById(child, componentId))
      .filter((child): child is DesignNode => Boolean(child));

    return {
      ...node,
      children,
    };
  }

  return node;
};

const INITIAL_STATE = {
  document: null,
  compositionStatus: "idle" as CompositionStatus,
  compositionErrors: [] as CompositionError[],
  revision: 0,
  retryNonce: 0,
};

export const useDocumentStateStore = create<DocumentState>((set) => ({
  ...INITIAL_STATE,

  setDocument: (doc) =>
    set((state) => ({
      document: doc,
      revision: state.revision + 1,
      compositionStatus: doc ? "idle" : "idle",
      compositionErrors: [],
    })),

  setCompositionState: (status, errors) =>
    set({
      compositionStatus: status,
      compositionErrors: errors ?? [],
    }),

  requestRetry: () =>
    set((state) => ({
      retryNonce: state.retryNonce + 1,
      compositionStatus: "idle",
    })),

  skipComponent: (componentId) =>
    set((state) => {
      if (!state.document) {
        return state;
      }

      const nextRoot = removeComponentById(state.document.root, componentId);
      const nextDocument: DesignDocument = {
        ...state.document,
        root: nextRoot ?? EMPTY_LAYOUT_ROOT,
      };

      return {
        document: nextDocument,
        revision: state.revision + 1,
        compositionStatus: "idle" as CompositionStatus,
        compositionErrors: state.compositionErrors.filter(
          (error) => error.componentId !== componentId
        ),
      };
    }),

  reset: () => set(INITIAL_STATE),
}));
