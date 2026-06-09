import { create } from "zustand";

/**
 * Comment-layer state for the review surface.
 *
 * A comment is pinned to a Forge anchor that survives regeneration — either the
 * deterministic instance id (`data-oods-node-id`) or the slot name
 * (`data-oods-label`). The store mirrors the revision-counter idiom used by
 * `data-context.ts`: every mutation bumps `revision` so subscribers re-resolve.
 *
 * Decoupled by design: the store references only anchor *strings*, never the
 * preview DOM or the document model. v1 uses instance anchors (patch_node
 * id-preservation keeps the node id stable); the schema also carries slot
 * anchors so the Option B flip (s20-m07) needs no UI rewrite.
 */

export type CommentAnchorKind = "instance" | "slot";

export type CommentAnchor = {
  kind: CommentAnchorKind;
  /** `data-oods-node-id` — present for instance anchors. */
  componentId?: string;
  /** `data-oods-label` — present for slot anchors. */
  slotLabel?: string;
};

export type Comment = {
  id: string;
  anchor: CommentAnchor;
  text: string;
  createdAt: string;
  resolved: boolean;
};

type CommentState = {
  /** All comments, in creation order. */
  comments: Comment[];

  /** Monotonic revision counter for change detection. */
  revision: number;

  /** Pin a new comment to an anchor. No-op for empty text. */
  addComment: (anchor: CommentAnchor, text: string) => void;

  /** Toggle a comment's resolved flag (defaults to resolved=true). */
  resolveComment: (id: string, resolved?: boolean) => void;

  /** Remove a comment by id. */
  deleteComment: (id: string) => void;

  /** Clear every comment. */
  reset: () => void;
};

const INITIAL_STATE = {
  comments: [] as Comment[],
  revision: 0,
};

const createCommentId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const useCommentStateStore = create<CommentState>((set) => ({
  ...INITIAL_STATE,

  addComment: (anchor, text) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return state;
      }
      const comment: Comment = {
        id: createCommentId(),
        anchor,
        text: trimmed,
        createdAt: new Date().toISOString(),
        resolved: false,
      };
      return {
        comments: [...state.comments, comment],
        revision: state.revision + 1,
      };
    }),

  resolveComment: (id, resolved = true) =>
    set((state) => {
      let changed = false;
      const comments = state.comments.map((comment) => {
        if (comment.id === id && comment.resolved !== resolved) {
          changed = true;
          return { ...comment, resolved };
        }
        return comment;
      });
      return changed ? { comments, revision: state.revision + 1 } : state;
    }),

  deleteComment: (id) =>
    set((state) => {
      const comments = state.comments.filter((comment) => comment.id !== id);
      if (comments.length === state.comments.length) {
        return state;
      }
      return { comments, revision: state.revision + 1 };
    }),

  reset: () => set(INITIAL_STATE),
}));

export const resetCommentState = () => {
  useCommentStateStore.setState(INITIAL_STATE);
};

// ---- Pure anchor helpers (shared by the overlay + pin resolution) -----------

/**
 * Derive a comment anchor from a Forge preview anchor. Prefers the deterministic
 * instance id (`data-oods-node-id`) — the v1 default that patch_node preserves —
 * and falls back to the slot label. Returns null when neither is present.
 */
export const anchorFromPreview = (
  nodeId: string | null,
  label: string | null,
): CommentAnchor | null => {
  if (nodeId) {
    return { kind: "instance", componentId: nodeId };
  }
  if (label) {
    return { kind: "slot", slotLabel: label };
  }
  return null;
};

/** Stable key for an anchor — used for grouping and equality. */
export const anchorKey = (anchor: CommentAnchor): string =>
  anchor.kind === "instance"
    ? `instance:${anchor.componentId ?? ""}`
    : `slot:${anchor.slotLabel ?? ""}`;

export const anchorsEqual = (a: CommentAnchor, b: CommentAnchor): boolean =>
  anchorKey(a) === anchorKey(b);

/** Does a live preview anchor (nodeId/label) resolve to this comment anchor? */
export const anchorMatchesPreview = (
  anchor: CommentAnchor,
  preview: { nodeId: string | null; label: string | null },
): boolean =>
  anchor.kind === "instance"
    ? Boolean(anchor.componentId) && anchor.componentId === preview.nodeId
    : Boolean(anchor.slotLabel) && anchor.slotLabel === preview.label;
