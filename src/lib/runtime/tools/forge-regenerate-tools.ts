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
import type { DesignDocument, DesignNode } from "@/types/document-model";
import { isComponentNode, isLayoutNode } from "@/types/document-model";

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

/**
 * What the AGENT sends: an intent for headless Forge to compose, not a
 * document. The Tool UI runs `designCompose(intent)` -> converts the UiSchema
 * -> builds {@link ForgeRegenerateToolArgs} with the composed document, so the
 * human reviews Forge's actual composition (selections, confidence) before
 * anything applies.
 */
export type ForgeRegenerateAgentToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  /** Natural-language description of the FULL document for design_compose. */
  intent: string;
  /** Forge layout template (e.g. "landing", "dashboard"); defaults to auto. */
  layout?: string;
  /** REQUIRED — see {@link ForgeRegenerateToolArgs.addressesCommentIds}. */
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

/** A live anchor as collected from the regenerated preview (matches the
 * preview inject-script's collectAnchors output: data-oods-node-id +
 * data-oods-label + the nearest-ancestor label, decision 119). */
export type RegeneratePreviewAnchor = {
  nodeId: string | null;
  label: string | null;
  /** Nearest ANCESTOR data-oods-label — the entity-slot disambiguator. */
  ancestorLabel?: string | null;
};

export type AnchorReconciliation = {
  commentId: string;
  /**
   * - `survived`: the comment's anchor is still present in the regenerated
   *   preview (durable slot label, or — rarely — an exact instance-id match), so
   *   it re-pins automatically via the live PREVIEW_ANCHORS rect loop.
   * - `repinned`: the comment's anchor was UPGRADED to an unambiguous
   *   entity-slot anchor (decision 119) — either an instance anchor whose node
   *   survived and carries a durable label (flip before the NEXT regenerate
   *   orphans it), or an entity-slot anchor whose label moved to a different
   *   labeled ancestor. Apply `anchor` via `reanchorComments`.
   * - `orphaned`: no confident anchor in the new preview. The comment stays in
   *   the store and renders detached/flagged for manual attention. It is NEVER
   *   silently resolved (that would drop the human's critique) and NEVER pinned
   *   to an ambiguous candidate (label collisions risk pinning to the wrong node).
   */
  status: "survived" | "repinned" | "orphaned";
  anchor: Comment["anchor"];
};

const anchorPairKey = (label: string, ancestorLabel: string | null | undefined) =>
  `${label}\u0000${ancestorLabel ?? ""}`;

/**
 * Reconcile OPEN comment anchors against the anchors present after a full Forge
 * regenerate. Pure + side-effect-free; re-pins are applied by the caller via
 * `reanchorComments`.
 *
 * Durability model (sprint-20-m07 investigation):
 *   - Instance anchors (data-oods-node-id) are FRAGILE — Forge re-mints ids as
 *     `${slot}-${counter}` and the counter shifts on any structural change. An
 *     instance anchor survives only if Forge happened to keep the exact id.
 *   - Slot anchors (data-oods-label = meta.label) are DURABLE — no counter,
 *     structure-independent — but NOT unique within a document. A label that now
 *     resolves to multiple elements is ambiguous, so it is treated as orphaned
 *     rather than risk a false-positive re-pin.
 *   - Entity-slot anchors (decision 119: label + nearest-ancestor-label
 *     disambiguator) are the durable form this pass RE-PINS toward: a surviving
 *     instance anchor whose node carries an unambiguous label is upgraded, so
 *     the comment stops depending on an id the next regenerate will re-mint.
 *
 * Conservatism is preserved: survive/re-pin only on an UNAMBIGUOUS match,
 * orphan on anything uncertain.
 */
export const reconcileAnchorsAfterRegenerate = (
  openComments: Comment[],
  newAnchors: RegeneratePreviewAnchor[],
): AnchorReconciliation[] => {
  const labelCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const byNodeId = new Map<string, RegeneratePreviewAnchor>();
  const byLabel = new Map<string, RegeneratePreviewAnchor>();
  for (const anchor of newAnchors) {
    if (anchor.nodeId && !byNodeId.has(anchor.nodeId)) {
      byNodeId.set(anchor.nodeId, anchor);
    }
    if (anchor.label) {
      labelCounts.set(anchor.label, (labelCounts.get(anchor.label) ?? 0) + 1);
      const pair = anchorPairKey(anchor.label, anchor.ancestorLabel);
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
      if (!byLabel.has(anchor.label)) {
        byLabel.set(anchor.label, anchor);
      }
    }
  }

  return openComments.map((comment): AnchorReconciliation => {
    const { anchor } = comment;

    if (anchor.kind === "entity-slot" && anchor.slotLabel) {
      const matches = newAnchors.filter(
        (candidate) =>
          candidate.label === anchor.slotLabel &&
          (anchor.disambiguator === undefined ||
            (candidate.ancestorLabel ?? undefined) === anchor.disambiguator),
      );
      if (matches.length === 1) {
        return { commentId: comment.id, status: "survived", anchor };
      }
      // The (label, ancestor) pair vanished — if the label itself is still
      // unique, the slot just moved under a different ancestor: re-pin to it.
      if (matches.length === 0 && labelCounts.get(anchor.slotLabel) === 1) {
        const target = byLabel.get(anchor.slotLabel);
        const ancestorLabel = target?.ancestorLabel ?? undefined;
        return {
          commentId: comment.id,
          status: "repinned",
          anchor: {
            kind: "entity-slot",
            slotLabel: anchor.slotLabel,
            ...(ancestorLabel ? { disambiguator: ancestorLabel } : {}),
          },
        };
      }
      return { commentId: comment.id, status: "orphaned", anchor };
    }

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
      const match = byNodeId.get(anchor.componentId);
      if (!match) {
        // We have no durable label stored on a v1 instance anchor to recover
        // from, so a re-minted id orphans (conservative, decision 141).
        return { commentId: comment.id, status: "orphaned", anchor };
      }
      // Decision-119 flip: the node survived AND carries a durable label whose
      // (label, ancestor) pair is unambiguous — upgrade to entity-slot so the
      // NEXT regenerate (which re-mints this id) cannot orphan the comment.
      if (
        match.label &&
        pairCounts.get(anchorPairKey(match.label, match.ancestorLabel)) === 1
      ) {
        return {
          commentId: comment.id,
          status: "repinned",
          anchor: {
            kind: "entity-slot",
            slotLabel: match.label,
            ...(match.ancestorLabel ? { disambiguator: match.ancestorLabel } : {}),
          },
        };
      }
      return { commentId: comment.id, status: "survived", anchor };
    }

    return { commentId: comment.id, status: "orphaned", anchor };
  });
};

// ============================================================================
// Expected anchors from a converted document
// ============================================================================

const toLabelString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
};

/**
 * The anchors the regenerated preview WILL broadcast, computed from the
 * converted document itself — so reconciliation can run synchronously at
 * Accept time instead of waiting for the iframe's PREVIEW_ANCHORS round-trip.
 *
 * Mirrors the render contract exactly: every ComponentNode renders with
 * data-oods-node-id = its id, and data-oods-label from the same label source
 * the fragments adapter forwards (meta.label, then the raw label/title prop).
 * Layout nodes render as unlabeled native divs, so `ancestorLabel` is null on
 * this path (labeled ancestors only exist on Forge full-render surfaces).
 */
export const collectExpectedRegenerateAnchors = (
  document: DesignDocument,
): RegeneratePreviewAnchor[] => {
  const anchors: RegeneratePreviewAnchor[] = [];
  const visit = (node: DesignNode) => {
    if (isComponentNode(node)) {
      anchors.push({
        nodeId: node.id,
        label:
          toLabelString(node.meta?.label) ??
          toLabelString(node.props.label) ??
          toLabelString(node.props.title),
        ancestorLabel: null,
      });
      return;
    }
    if (isLayoutNode(node)) {
      node.children.forEach(visit);
    }
  };
  visit(document.root);
  return anchors;
};
