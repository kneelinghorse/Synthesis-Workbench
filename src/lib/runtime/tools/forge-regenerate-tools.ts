/**
 * Forge Regenerate Tool — re-homing the review loop onto a headless-Forge regenerate (s21-m03).
 *
 * The north-star (Option B) is: the agent regenerates the document via HEADLESS
 * Forge (`design.compose`) rather than mutating it locally. A full regenerate
 * replaces the WHOLE document, so it is `set_document`-shaped — it reuses the
 * suggest-and-confirm gate and the document-state apply path verbatim (decision
 * 117). This module captures the DESIGN + contract (pure helpers + the
 * fresh-anchor reconciliation pass) so m04 only has to wire the live Forge call,
 * the agent tool definition, and the Tool UI. It deliberately does NOT make the
 * Forge `design.compose` call itself — that is m04.
 *
 * Two things change versus local `set_document`:
 *   1. `addressesCommentIds` becomes MANDATORY. A wholesale rewrite has no single
 *      target node, so the `patch_node` instance-anchor auto-match safety net
 *      (componentId === nodeId, decision 122) cannot apply — Forge re-mints node
 *      ids as `${slot}-${counter}` and the counter shifts on any structural
 *      change. The agent's declared ids are the ONLY durable linkage; without
 *      them the m10 endless-re-propose bug class loses its backstop.
 *   2. A FRESH-ANCHOR RECONCILIATION pass runs after apply. Instance anchors
 *      (data-oods-node-id) do not survive a regenerate; durable slot labels
 *      (data-oods-label = meta.label) do. Reconciliation classifies every OPEN
 *      comment as survived (its anchor is still present) or orphaned (kept
 *      detached + flagged for manual attention, NEVER silently resolved or
 *      mis-pinned). See {@link reconcileAnchorsAfterRegenerate}.
 */

import type {
  SetDocumentToolArgs,
  SetDocumentToolResult,
} from "./document-tools";
import { confirmSetDocument, rejectSetDocument } from "./document-tools";
import type { CommentChangeLink, Comment } from "@/lib/stores/comment-state";

// ============================================================================
// Tool name
// ============================================================================

export const FORGE_REGENERATE_TOOL_NAME = "forge_regenerate";

// ============================================================================
// Types
//
// A regenerate is `set_document`-shaped: the Forge-composed document replaces the
// active document. The one schema difference from set_document is that
// `addressesCommentIds` is REQUIRED, not optional.
// ============================================================================

export type ForgeRegenerateToolArgs = Omit<
  SetDocumentToolArgs,
  "addressesCommentIds"
> & {
  /**
   * Ids of the pinned review comments this regenerate addresses. REQUIRED for
   * the Forge path (unlike set_document, where it is optional): a full regenerate
   * has no nodeId for the auto-match safety net to use, so this is the only
   * linkage that resolves comments. The tool definition (m04) marks it required;
   * the type enforces it here.
   */
  addressesCommentIds: string[];
};

// A regenerate applies via the same document-state path as set_document, so the
// outcome shape is identical.
export type ForgeRegenerateToolResult = SetDocumentToolResult;

// ============================================================================
// Suggest-and-confirm wrappers
//
// Regenerate IS set_document-shaped, so these delegate to the set_document
// confirm gate rather than duplicating it. The named seam lets m04 register a
// distinct `forge_regenerate` tool + Tool UI while reusing the proven apply path.
// ============================================================================

export async function confirmForgeRegenerate(
  args: ForgeRegenerateToolArgs,
): Promise<ForgeRegenerateToolResult> {
  // The Forge-composed document replaces the active document — identical to an
  // accepted set_document. confirmSetDocument tags decision: "applied".
  return confirmSetDocument(args);
}

export function rejectForgeRegenerate(): ForgeRegenerateToolResult {
  // A discarded regenerate must not mutate the store — same no-op as set_document.
  return rejectSetDocument();
}

// ============================================================================
// Comment resolution linkage
//
// Declared-ids ONLY (a regenerate has no nodeId, so no instance auto-match).
// Null unless the document actually applied — a discarded/failed regenerate must
// never silently resolve a pinned comment (mirrors setDocumentCommentLink).
// ============================================================================

export const forgeRegenerateCommentLink = (
  args: ForgeRegenerateToolArgs,
  result: ForgeRegenerateToolResult,
): CommentChangeLink | null =>
  result.saved ? { commentIds: args.addressesCommentIds } : null;

// ============================================================================
// Fresh-anchor reconciliation
//
// After a full Forge regenerate the preview is composed from scratch with NEW
// anchors. This pass decides what happens to each still-OPEN comment.
// ============================================================================

/** A live anchor pair as collected from the regenerated preview (matches the
 * preview inject-script's collectAnchors output: data-oods-node-id + data-oods-label). */
export type RegeneratePreviewAnchor = {
  nodeId: string | null;
  label: string | null;
};

export type AnchorReconciliation = {
  commentId: string;
  /**
   * - `survived`: the comment's anchor is still present in the regenerated
   *   preview (durable slot label, or — rarely — an exact instance-id match), so
   *   it re-pins automatically via the live PREVIEW_ANCHORS rect loop.
   * - `orphaned`: no confident anchor in the new preview. The comment stays in
   *   the store and renders detached/flagged for manual attention. It is NEVER
   *   silently resolved (that would drop the human's critique) and NEVER pinned
   *   to an ambiguous candidate (label collisions risk pinning to the wrong node).
   */
  status: "survived" | "orphaned";
  anchor: Comment["anchor"];
};

/**
 * Reconcile OPEN comment anchors against the anchors present after a full Forge
 * regenerate. Pure + side-effect-free.
 *
 * Durability model (sprint-20-m07 investigation):
 *   - Instance anchors (data-oods-node-id) are FRAGILE — Forge re-mints ids as
 *     `${slot}-${counter}` and the counter shifts on any structural change. An
 *     instance anchor survives only if Forge happened to keep the exact id.
 *   - Slot anchors (data-oods-label = meta.label) are DURABLE — no counter,
 *     structure-independent — but NOT unique within a document. A label that now
 *     resolves to multiple elements is ambiguous, so it is treated as orphaned
 *     rather than risk a false-positive re-pin.
 *
 * The forward fix (decision 119) is an `entity-slot` anchor (label + a
 * disambiguator = nearest ancestor's data-oods-label) so colliding labels can be
 * told apart; until it lands, this pass is conservative — survive on an
 * UNAMBIGUOUS match, orphan on anything uncertain. That makes "pin comments to
 * the durable slot label for the regenerate path" the design recommendation:
 * label-anchored comments survive by construction.
 */
export const reconcileAnchorsAfterRegenerate = (
  openComments: Comment[],
  newAnchors: RegeneratePreviewAnchor[],
): AnchorReconciliation[] => {
  const newNodeIds = new Set(
    newAnchors
      .map((a) => a.nodeId)
      .filter((id): id is string => Boolean(id)),
  );
  const labelCounts = new Map<string, number>();
  for (const { label } of newAnchors) {
    if (label) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
  }

  return openComments.map((comment): AnchorReconciliation => {
    const { anchor } = comment;

    if (anchor.kind === "slot" && anchor.slotLabel) {
      // Durable, but only an UNAMBIGUOUS (exactly-one) match counts as survived.
      const survived = labelCounts.get(anchor.slotLabel) === 1;
      return {
        commentId: comment.id,
        status: survived ? "survived" : "orphaned",
        anchor,
      };
    }

    if (anchor.kind === "instance" && anchor.componentId) {
      // Survives only if Forge kept the exact id; we have no durable label stored
      // on a v1 instance anchor to recover from, so anything else orphans.
      const survived = newNodeIds.has(anchor.componentId);
      return {
        commentId: comment.id,
        status: survived ? "survived" : "orphaned",
        anchor,
      };
    }

    return { commentId: comment.id, status: "orphaned", anchor };
  });
};
