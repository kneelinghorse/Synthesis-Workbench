/**
 * Document Authoring Tools
 *
 * Tools for LLM-driven design document creation and editing.
 *   set_document   — Creates or replaces the active design document
 *   patch_node     — Modifies a specific node by ID in the active document
 *
 * Both tools update the document-state store, which triggers the
 * composition renderer → preview pipeline automatically.
 */

import type {
  DesignDocument,
  DesignNode,
  ComponentNode,
  ComponentProps,
} from "@/types/document-model";
import { isLayoutNode, isComponentNode } from "@/types/document-model";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useDataContextStore } from "@/lib/stores/data-context";
import { useProjectStateStore } from "@/lib/stores/project-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { useTokenStateStore } from "@/lib/stores/token-state";

// ============================================================================
// Tool Names
// ============================================================================

export const SET_DOCUMENT_TOOL_NAME = "set_document";
export const PATCH_NODE_TOOL_NAME = "patch_node";
export const SET_DATA_CONTEXT_TOOL_NAME = "set_data_context";

// ============================================================================
// set_document Types
// ============================================================================

export type SetDocumentToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  /** Optional project scope for persistence (./projects/{projectSlug}/...) */
  projectSlug?: string;
  /** Design slug for persistence (alphanumeric + hyphens + underscores) */
  slug?: string;
  /** The full DesignDocument to set as active */
  document?: DesignDocument;
  /** Whether to persist to disk via YAML (default: false) */
  persist?: boolean;
  /** Optional data context for $data.x binding resolution */
  data?: Record<string, unknown>;
};

export type SetDocumentToolResult = {
  saved: boolean;
  projectSlug?: string;
  slug?: string;
  nodeCount: number;
  componentCount: number;
  persisted: boolean;
  persistedPath?: string;
  errors?: string[];
  resolvedAt: string;
};

// ============================================================================
// patch_node Types
// ============================================================================

export type PatchNodeToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  /** ID of the ComponentNode to patch */
  nodeId: string;
  /** New props to merge into the existing node's props */
  props?: ComponentProps;
  /** New component ref (e.g. "oods:Button") */
  ref?: string;
};

export type PatchNodeToolResult = {
  patched: boolean;
  nodeId: string;
  errors?: string[];
  resolvedAt: string;
};

// ============================================================================
// Utilities
// ============================================================================

/** Count total nodes in a tree */
export function countNodes(node: DesignNode): number {
  if (isComponentNode(node)) return 1;
  if (isLayoutNode(node)) {
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
  }
  return 0;
}

/** Count ComponentNodes in a tree */
export function countComponents(node: DesignNode): number {
  if (isComponentNode(node)) return 1;
  if (isLayoutNode(node)) {
    return node.children.reduce(
      (sum, child) => sum + countComponents(child),
      0,
    );
  }
  return 0;
}

/** Find a ComponentNode by ID in the tree (returns reference for mutation) */
export function findNodeById(
  node: DesignNode,
  id: string,
): ComponentNode | null {
  if (isComponentNode(node) && node.id === id) {
    return node;
  }
  if (isLayoutNode(node)) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

/** Deep clone a DesignDocument (safe for mutation) */
function cloneDocument(doc: DesignDocument): DesignDocument {
  return JSON.parse(JSON.stringify(doc));
}

// ============================================================================
// set_document Executor
// ============================================================================

const normalizeMaybeSlug = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export async function executeSetDocument(
  args: SetDocumentToolArgs,
): Promise<SetDocumentToolResult> {
  const doc = args.document;

  if (!doc || !doc.root) {
    return {
      saved: false,
      nodeCount: 0,
      componentCount: 0,
      persisted: false,
      errors: ["No document provided or document has no root node."],
      resolvedAt: new Date().toISOString(),
    };
  }

  const nodeCount = countNodes(doc.root);
  const componentCount = countComponents(doc.root);

  // Update the document-state store (triggers composition preview)
  useDocumentStateStore.getState().setDocument(doc);

  // If data context provided, update the data context store
  if (args.data) {
    useDataContextStore.getState().setContext(args.data);
  }

  const activeProjectSlug = normalizeMaybeSlug(
    useProjectStateStore.getState().activeProjectSlug ?? undefined
  );
  const activeDesignSlug = normalizeMaybeSlug(
    useProjectStateStore.getState().activeDesignSlug ?? undefined
  );
  const explicitProjectSlug = normalizeMaybeSlug(args.projectSlug);
  const explicitSlug = normalizeMaybeSlug(args.slug);
  const projectSlug = explicitProjectSlug ?? activeProjectSlug;
  const slug =
    explicitSlug ??
    (args.persist === true ? activeDesignSlug : undefined);

  const shouldPersist =
    args.persist === true ||
    (args.persist !== false && Boolean(explicitSlug));

  if (!shouldPersist) {
    if (projectSlug) {
      useProjectStateStore.getState().setActiveProject(projectSlug, slug ?? null);
    } else if (slug) {
      useProjectStateStore.getState().setActiveDesign(slug);
    }

    return {
      saved: true,
      projectSlug,
      slug,
      nodeCount,
      componentCount,
      persisted: false,
      resolvedAt: new Date().toISOString(),
    };
  }

  if (!slug) {
    return {
      saved: true,
      projectSlug,
      slug: undefined,
      nodeCount,
      componentCount,
      persisted: false,
      errors: [
        "Persistence requested but no design slug is available. Provide slug or select an active design.",
      ],
      resolvedAt: new Date().toISOString(),
    };
  }

  try {
    const tokenSnapshot = useTokenStateStore.getState().getPersistedSnapshot();
    const previewTheme = usePreviewStateStore.getState().theme;
    const response = await fetch("/api/designs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectSlug,
        slug,
        document: doc,
        tokenState: {
          values: tokenSnapshot.tokens,
          changes: tokenSnapshot.changes,
          history: tokenSnapshot.history,
          annotations: tokenSnapshot.annotations,
          theme: previewTheme,
        },
      }),
    });

    const payload = (await response.json()) as {
      saved?: boolean;
      projectSlug?: string | null;
      slug?: string;
      filePath?: string;
      error?: string;
    };

    if (!response.ok || payload.saved !== true) {
      return {
        saved: true,
        projectSlug,
        slug,
        nodeCount,
        componentCount,
        persisted: false,
        errors: [
          payload.error ??
            `Persist failed with HTTP ${response.status}`,
        ],
        resolvedAt: new Date().toISOString(),
      };
    }

    const persistedProjectSlug = normalizeMaybeSlug(
      typeof payload.projectSlug === "string"
        ? payload.projectSlug
        : projectSlug
    );
    const persistedSlug = normalizeMaybeSlug(payload.slug) ?? slug;

    if (persistedProjectSlug) {
      useProjectStateStore
        .getState()
        .setActiveProject(persistedProjectSlug, persistedSlug);
    } else {
      useProjectStateStore.getState().setActiveDesign(persistedSlug);
    }

    return {
      saved: true,
      projectSlug: persistedProjectSlug,
      slug: persistedSlug,
      nodeCount,
      componentCount,
      persisted: true,
      persistedPath:
        typeof payload.filePath === "string" ? payload.filePath : undefined,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      saved: true,
      projectSlug,
      slug,
      nodeCount,
      componentCount,
      persisted: false,
      errors: [error instanceof Error ? error.message : "Persist failed"],
      resolvedAt: new Date().toISOString(),
    };
  }

}

// ============================================================================
// patch_node Executor
// ============================================================================

export function executePatchNode(
  args: PatchNodeToolArgs,
): PatchNodeToolResult {
  const store = useDocumentStateStore.getState();
  const currentDoc = store.document;

  if (!currentDoc) {
    return {
      patched: false,
      nodeId: args.nodeId,
      errors: ["No active document. Use set_document first."],
      resolvedAt: new Date().toISOString(),
    };
  }

  // Clone to avoid mutating the store state directly
  const cloned = cloneDocument(currentDoc);
  const target = findNodeById(cloned.root, args.nodeId);

  if (!target) {
    return {
      patched: false,
      nodeId: args.nodeId,
      errors: [
        `Node with id "${args.nodeId}" not found in the active document.`,
      ],
      resolvedAt: new Date().toISOString(),
    };
  }

  // Apply patches
  if (args.ref) {
    target.ref = args.ref;
  }
  if (args.props) {
    target.props = { ...target.props, ...args.props };
  }

  // Update the store (triggers re-render)
  store.setDocument(cloned);

  return {
    patched: true,
    nodeId: args.nodeId,
    resolvedAt: new Date().toISOString(),
  };
}

// ============================================================================
// set_data_context Types
// ============================================================================

export type SetDataContextToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  /** The data context object for $data.x binding resolution */
  data: Record<string, unknown>;
  /** If true, merge with existing context instead of replacing (default: false) */
  merge?: boolean;
};

export type SetDataContextToolResult = {
  updated: boolean;
  keyCount: number;
  errors?: string[];
  resolvedAt: string;
};

// ============================================================================
// set_data_context Executor
// ============================================================================

export function executeSetDataContext(
  args: SetDataContextToolArgs,
): SetDataContextToolResult {
  if (!args.data || typeof args.data !== "object") {
    return {
      updated: false,
      keyCount: 0,
      errors: ["No data object provided."],
      resolvedAt: new Date().toISOString(),
    };
  }

  const store = useDataContextStore.getState();

  if (args.merge) {
    store.mergeContext(args.data);
  } else {
    store.setContext(args.data);
  }

  const keyCount = Object.keys(useDataContextStore.getState().context).length;

  return {
    updated: true,
    keyCount,
    resolvedAt: new Date().toISOString(),
  };
}
