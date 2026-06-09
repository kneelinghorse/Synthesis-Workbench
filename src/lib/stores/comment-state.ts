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

/** How a comment was resolved: a human click vs. an accepted agent change. */
export type CommentResolvedBy = "user" | "change";

export type Comment = {
  id: string;
  anchor: CommentAnchor;
  text: string;
  createdAt: string;
  resolved: boolean;
  /** When the comment was resolved (ISO). Absent while open. */
  resolvedAt?: string;
  /** What closed it — a manual resolve ("user") or an accepted change ("change"). */
  resolvedBy?: CommentResolvedBy;
};

/**
 * Describes which comments an accepted change addresses. Carried from the
 * agent's tool call (`commentIds`, the durable explicit linkage that also
 * covers set_document) and the patch target (`nodeId`, the instance-anchor
 * safety net). See {@link commentsAddressedByChange}.
 */
export type CommentChangeLink = {
  /** Comment ids the agent declared this change resolves (`addressesCommentIds`). */
  commentIds?: string[];
  /** patch_node target id — auto-matches instance-anchored comments pinned to it. */
  nodeId?: string;
};

type CommentState = {
  /** All comments, in creation order. */
  comments: Comment[];

  /** Monotonic revision counter for change detection. */
  revision: number;

  /** Pin a new comment to an anchor. No-op for empty text. */
  addComment: (anchor: CommentAnchor, text: string) => void;

  /** Toggle a comment's resolved flag (defaults to resolved=true, by="user"). */
  resolveComment: (
    id: string,
    resolved?: boolean,
    by?: CommentResolvedBy,
  ) => void;

  /**
   * Resolve every OPEN comment a just-accepted change addresses, in one bump.
   * This is what breaks the re-proposal loop: once resolved, a comment leaves
   * the agent's open list (`formatReviewComments`) so it stops being re-proposed.
   */
  resolveCommentsForChange: (change: CommentChangeLink) => void;

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

  resolveComment: (id, resolved = true, by = "user") =>
    set((state) => {
      let changed = false;
      const comments = state.comments.map((comment) => {
        if (comment.id === id && comment.resolved !== resolved) {
          changed = true;
          // Re-opening clears the resolution metadata so the comment drops out
          // of the "resolved — do not re-propose" digest and reads as open again.
          return resolved
            ? {
                ...comment,
                resolved,
                resolvedAt: new Date().toISOString(),
                resolvedBy: by,
              }
            : { ...comment, resolved, resolvedAt: undefined, resolvedBy: undefined };
        }
        return comment;
      });
      return changed ? { comments, revision: state.revision + 1 } : state;
    }),

  resolveCommentsForChange: (change) =>
    set((state) => {
      const targetIds = new Set(
        commentsAddressedByChange(state.comments, change),
      );
      if (targetIds.size === 0) {
        return state;
      }
      const resolvedAt = new Date().toISOString();
      const comments = state.comments.map((comment) =>
        targetIds.has(comment.id)
          ? { ...comment, resolved: true, resolvedAt, resolvedBy: "change" as const }
          : comment,
      );
      return { comments, revision: state.revision + 1 };
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

/**
 * Which OPEN comments does an accepted change resolve? A change addresses a
 * comment when the agent explicitly named it (`commentIds` — the durable
 * linkage that also covers a full `set_document` rewrite) OR — for a
 * `patch_node` — the patched node carries the instance anchor a comment is
 * pinned to (`nodeId === componentId`, the safety net for when the agent omits
 * the id). Already-resolved comments never match, so accepting a later change
 * can't re-resolve (and re-stamp) a closed one. Pure + side-effect-free.
 */
export const commentsAddressedByChange = (
  comments: Comment[],
  change: CommentChangeLink,
): string[] => {
  const declared = new Set(change.commentIds ?? []);
  const matched: string[] = [];
  for (const comment of comments) {
    if (comment.resolved) {
      continue;
    }
    const byDeclaredId = declared.has(comment.id);
    const byAnchor =
      Boolean(change.nodeId) &&
      comment.anchor.kind === "instance" &&
      comment.anchor.componentId === change.nodeId;
    if (byDeclaredId || byAnchor) {
      matched.push(comment.id);
    }
  }
  return matched;
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
