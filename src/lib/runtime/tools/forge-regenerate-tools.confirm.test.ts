import { beforeEach, describe, expect, it } from "vitest";

import { useDocumentStateStore } from "@/lib/stores/document-state";
import type { Comment, CommentAnchor } from "@/lib/stores/comment-state";
import type {
  ComponentNode,
  DesignDocument,
  LayoutNode,
} from "@/types/document-model";

import {
  confirmForgeRegenerate,
  forgeRegenerateCommentLink,
  reconcileAnchorsAfterRegenerate,
  rejectForgeRegenerate,
  type ForgeRegenerateToolArgs,
} from "./forge-regenerate-tools";

const baseDoc = (): DesignDocument => ({
  metadata: { title: "t" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 8 },
    children: [
      {
        nodeType: "component",
        id: "btn-1",
        ref: "oods:Button",
        props: { label: "Save" },
      },
    ],
  },
});

const setDoc = (doc: DesignDocument) =>
  useDocumentStateStore.getState().setDocument(doc);
const getDoc = () => useDocumentStateStore.getState().document;
const button = (): ComponentNode =>
  (getDoc()!.root as LayoutNode).children[0] as ComponentNode;

// A regenerate is set_document-shaped: it carries the whole Forge-composed
// document plus the MANDATORY ids it addresses.
const regenArgs = (
  document: DesignDocument | undefined,
  addressesCommentIds: string[],
): ForgeRegenerateToolArgs => ({ requestId: "r", document, addressesCommentIds });

// ============================================================================
// Confirm gate parity — a regenerate reuses the set_document suggest-and-confirm
// path (decision 117): only Accept mutates the store, Reject is a pure no-op.
// ============================================================================

describe("suggest-and-confirm Forge regenerate", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    setDoc(baseDoc());
  });

  it("confirmForgeRegenerate replaces the whole document and tags decision applied", async () => {
    const next = baseDoc();
    next.metadata.title = "regenerated";

    const result = await confirmForgeRegenerate(regenArgs(next, ["c-1"]));

    expect(result.decision).toBe("applied");
    expect(result.saved).toBe(true);
    expect(getDoc()?.metadata.title).toBe("regenerated");
  });

  it("rejectForgeRegenerate leaves the document untouched (the whole point of confirm)", () => {
    const before = getDoc();

    const result = rejectForgeRegenerate();

    expect(result.decision).toBe("rejected");
    expect(result.saved).toBe(false);
    // Identity unchanged — a discarded regenerate must not call setDocument.
    expect(getDoc()).toBe(before);
    expect(button().props.label).toBe("Save");
  });
});

// ============================================================================
// Comment linkage gating — declared ids ONLY (a regenerate has no nodeId for the
// instance auto-match), null on reject or failed apply so a discarded/failed
// regenerate never silently closes a pinned comment.
// ============================================================================

describe("Forge-regenerate comment linkage gating", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    setDoc(baseDoc());
  });

  it("links exactly the declared ids on a successful Accept — and no nodeId (a full rewrite has no single target)", async () => {
    const args = regenArgs(baseDoc(), ["c-2", "c-3"]);
    const link = forgeRegenerateCommentLink(args, await confirmForgeRegenerate(args));

    expect(link).toEqual({ commentIds: ["c-2", "c-3"] });
    // Unlike patch_node, there is no nodeId auto-match safety net here.
    expect(link).not.toHaveProperty("nodeId");
  });

  it("is null on reject — a discarded regenerate must not resolve comments", () => {
    const args = regenArgs(baseDoc(), ["c-2"]);
    expect(forgeRegenerateCommentLink(args, rejectForgeRegenerate())).toBeNull();
  });

  it("is null when the regenerate failed to apply (no document)", async () => {
    const args = regenArgs(undefined, ["c-2"]);
    const result = await confirmForgeRegenerate(args); // no document -> saved:false
    expect(result.saved).toBe(false);
    expect(forgeRegenerateCommentLink(args, result)).toBeNull();
  });
});

// ============================================================================
// Fresh-anchor reconciliation — after a full regenerate, classify every OPEN
// comment as survived (re-pins via a durable anchor) or orphaned (kept detached,
// never silently resolved, never pinned to an ambiguous candidate).
// ============================================================================

const openComment = (id: string, anchor: CommentAnchor): Comment => ({
  id,
  anchor,
  text: `comment ${id}`,
  createdAt: "2026-06-10T00:00:00.000Z",
  resolved: false,
});

describe("fresh-anchor reconciliation after a full Forge regenerate", () => {
  it("a durable slot-label anchor survives when its label is uniquely present", () => {
    const comments = [openComment("c-1", { kind: "slot", slotLabel: "hero-cta" })];
    const newAnchors = [
      { nodeId: "hero-1", label: "hero-cta" },
      { nodeId: "body-2", label: "body-copy" },
    ];

    expect(reconcileAnchorsAfterRegenerate(comments, newAnchors)).toEqual([
      { commentId: "c-1", status: "survived", anchor: { kind: "slot", slotLabel: "hero-cta" } },
    ]);
  });

  it("a slot-label anchor orphans when its label vanished from the regenerated preview", () => {
    const comments = [openComment("c-1", { kind: "slot", slotLabel: "hero-cta" })];
    const newAnchors = [{ nodeId: "body-2", label: "body-copy" }];

    const [r] = reconcileAnchorsAfterRegenerate(comments, newAnchors);
    expect(r.status).toBe("orphaned");
  });

  it("a slot-label anchor orphans on a COLLISION (label now resolves to >1 element) — no false-positive re-pin", () => {
    const comments = [openComment("c-1", { kind: "slot", slotLabel: "card" })];
    const newAnchors = [
      { nodeId: "card-1", label: "card" },
      { nodeId: "card-2", label: "card" },
    ];

    const [r] = reconcileAnchorsAfterRegenerate(comments, newAnchors);
    expect(r.status).toBe("orphaned");
  });

  it("an instance (node-id) anchor survives only if Forge kept the exact id", () => {
    const comments = [openComment("c-1", { kind: "instance", componentId: "btn-1" })];
    const newAnchors = [{ nodeId: "btn-1", label: "primary-cta" }];

    const [r] = reconcileAnchorsAfterRegenerate(comments, newAnchors);
    expect(r.status).toBe("survived");
  });

  it("an instance anchor orphans when Forge renumbered the id — the durability gap that motivates label anchoring", () => {
    // Forge re-mints ids as ${slot}-${counter}; a structural change shifts the
    // counter, so btn-1 becomes (e.g.) btn-2 and the instance anchor cannot recover.
    const comments = [openComment("c-1", { kind: "instance", componentId: "btn-1" })];
    const newAnchors = [{ nodeId: "btn-2", label: "primary-cta" }];

    const [r] = reconcileAnchorsAfterRegenerate(comments, newAnchors);
    expect(r.status).toBe("orphaned");
  });

  it("classifies a mixed batch per-comment without resolving any of them", () => {
    const comments = [
      openComment("survives", { kind: "slot", slotLabel: "hero-cta" }),
      openComment("orphans", { kind: "instance", componentId: "gone-9" }),
    ];
    const newAnchors = [{ nodeId: "hero-1", label: "hero-cta" }];

    const result = reconcileAnchorsAfterRegenerate(comments, newAnchors);
    expect(result.map((r) => [r.commentId, r.status])).toEqual([
      ["survives", "survived"],
      ["orphans", "orphaned"],
    ]);
  });
});
