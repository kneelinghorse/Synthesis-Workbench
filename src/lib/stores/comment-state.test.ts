import { beforeEach, describe, expect, it } from "vitest";

import {
  anchorFromPreview,
  anchorKey,
  anchorMatchesPreview,
  anchorsEqual,
  commentsAddressedByChange,
  resetCommentState,
  useCommentStateStore,
  type Comment,
  type CommentAnchor,
} from "./comment-state";

const INSTANCE_ANCHOR: CommentAnchor = { kind: "instance", componentId: "btn-1" };
const SLOT_ANCHOR: CommentAnchor = { kind: "slot", slotLabel: "PrimarySaveButton" };

const store = () => useCommentStateStore.getState();

describe("comment-state store", () => {
  beforeEach(() => {
    resetCommentState();
  });

  it("starts empty at revision 0", () => {
    expect(store().comments).toEqual([]);
    expect(store().revision).toBe(0);
  });

  it("adds a comment pinned to an anchor and bumps the revision", () => {
    store().addComment(INSTANCE_ANCHOR, "  Make this smaller  ");

    const { comments, revision } = store();
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      anchor: INSTANCE_ANCHOR,
      text: "Make this smaller", // trimmed
      resolved: false,
    });
    expect(comments[0].id).toBeTruthy();
    expect(comments[0].createdAt).toBeTruthy();
    expect(revision).toBe(1);
  });

  it("ignores empty / whitespace-only comments (no revision bump)", () => {
    store().addComment(INSTANCE_ANCHOR, "   ");
    expect(store().comments).toHaveLength(0);
    expect(store().revision).toBe(0);
  });

  it("resolves and re-opens a comment, bumping revision only on real change", () => {
    store().addComment(INSTANCE_ANCHOR, "fix");
    const id = store().comments[0].id;
    const afterAdd = store().revision;

    store().resolveComment(id);
    expect(store().comments[0].resolved).toBe(true);
    expect(store().revision).toBe(afterAdd + 1);

    // Resolving again is a no-op — no spurious revision bump (drives re-renders).
    store().resolveComment(id);
    expect(store().revision).toBe(afterAdd + 1);

    store().resolveComment(id, false);
    expect(store().comments[0].resolved).toBe(false);
    expect(store().revision).toBe(afterAdd + 2);
  });

  it("deletes a comment by id and is a no-op for unknown ids", () => {
    store().addComment(INSTANCE_ANCHOR, "one");
    store().addComment(SLOT_ANCHOR, "two");
    const [first] = store().comments;
    const revBefore = store().revision;

    store().deleteComment("nonexistent");
    expect(store().comments).toHaveLength(2);
    expect(store().revision).toBe(revBefore);

    store().deleteComment(first.id);
    expect(store().comments).toHaveLength(1);
    expect(store().comments[0].anchor).toEqual(SLOT_ANCHOR);
    expect(store().revision).toBe(revBefore + 1);
  });

  it("stamps resolution provenance, and clears it on re-open", () => {
    store().addComment(INSTANCE_ANCHOR, "fix");
    const id = store().comments[0].id;

    store().resolveComment(id); // manual resolve defaults to by="user"
    expect(store().comments[0]).toMatchObject({
      resolved: true,
      resolvedBy: "user",
    });
    expect(store().comments[0].resolvedAt).toBeTruthy();

    // Re-opening must wipe the metadata so it doesn't linger in the
    // "resolved — do not re-propose" digest and read as still-handled.
    store().resolveComment(id, false);
    expect(store().comments[0].resolved).toBe(false);
    expect(store().comments[0].resolvedAt).toBeUndefined();
    expect(store().comments[0].resolvedBy).toBeUndefined();
  });

  it("resolveCommentsForChange closes the comments an accepted change addresses", () => {
    // The Derek repro: a card comment is pinned to its node id; the agent
    // proposes a patch_node targeting that id (WITHOUT declaring the comment id)
    // and the human Accepts. The patch must close the pinned comment so the
    // agent stops re-proposing it next turn.
    store().addComment(INSTANCE_ANCHOR, "rename to feedback card"); // anchor btn-1
    store().addComment(SLOT_ANCHOR, "untouched");
    const revBefore = store().revision;

    store().resolveCommentsForChange({ nodeId: "btn-1" });

    const [patched, untouched] = store().comments;
    expect(patched.resolved).toBe(true);
    expect(patched.resolvedBy).toBe("change");
    expect(patched.resolvedAt).toBeTruthy();
    // A comment on a different element is left open.
    expect(untouched.resolved).toBe(false);
    expect(store().revision).toBe(revBefore + 1);
  });

  it("resolveCommentsForChange is a no-op (no revision bump) when nothing matches", () => {
    store().addComment(INSTANCE_ANCHOR, "open"); // btn-1
    const revBefore = store().revision;

    // A patch to an unrelated node, with no declared ids, resolves nothing —
    // and must NOT bump the revision (a spurious bump would churn re-renders).
    store().resolveCommentsForChange({ nodeId: "other-node", commentIds: [] });

    expect(store().comments[0].resolved).toBe(false);
    expect(store().revision).toBe(revBefore);
  });
});

describe("commentsAddressedByChange", () => {
  const open = (over: Partial<Comment> = {}): Comment => ({
    id: "c1",
    anchor: { kind: "instance", componentId: "btn-1" },
    text: "x",
    createdAt: "2026-06-09T00:00:00.000Z",
    resolved: false,
    ...over,
  });

  it("matches a comment the agent explicitly declared (the set_document path)", () => {
    const comments = [open({ id: "a" }), open({ id: "b", anchor: SLOT_ANCHOR })];
    // set_document carries no nodeId — only the declared ids link it.
    expect(commentsAddressedByChange(comments, { commentIds: ["b"] })).toEqual([
      "b",
    ]);
  });

  it("auto-matches an instance-anchored comment by patch nodeId even with no declared id", () => {
    const comments = [open({ id: "a", anchor: { kind: "instance", componentId: "btn-1" } })];
    expect(commentsAddressedByChange(comments, { nodeId: "btn-1" })).toEqual([
      "a",
    ]);
  });

  it("never auto-matches a SLOT-anchored comment by nodeId (no false positives)", () => {
    // A slot anchor's label is not a node id; patch_node carries only a nodeId,
    // so a slot comment must be linked explicitly, never by the anchor net.
    const comments = [open({ id: "a", anchor: { kind: "slot", slotLabel: "btn-1" } })];
    expect(commentsAddressedByChange(comments, { nodeId: "btn-1" })).toEqual([]);
  });

  it("ignores already-resolved comments so a later accept can't re-resolve them", () => {
    const comments = [open({ id: "a", resolved: true })];
    expect(
      commentsAddressedByChange(comments, { commentIds: ["a"], nodeId: "btn-1" }),
    ).toEqual([]);
  });

  it("unions declared ids and the anchor match without duplicating", () => {
    const comments = [
      open({ id: "a", anchor: { kind: "instance", componentId: "btn-1" } }), // both paths hit
      open({ id: "b", anchor: { kind: "slot", slotLabel: "Title" } }), // declared only
    ];
    expect(
      commentsAddressedByChange(comments, { commentIds: ["a", "b"], nodeId: "btn-1" }),
    ).toEqual(["a", "b"]);
  });
});

describe("comment anchor helpers", () => {
  it("prefers the deterministic instance id, falling back to the slot label", () => {
    // Both present -> instance wins (patch_node preserves the node id in v1).
    expect(anchorFromPreview("btn-1", "PrimarySaveButton")).toEqual(INSTANCE_ANCHOR);
    // Only a slot label -> slot anchor.
    expect(anchorFromPreview(null, "PrimarySaveButton")).toEqual(SLOT_ANCHOR);
    // Neither -> not anchorable.
    expect(anchorFromPreview(null, null)).toBeNull();
  });

  it("keys and compares anchors by kind + identifier", () => {
    expect(anchorKey(INSTANCE_ANCHOR)).toBe("instance:btn-1");
    expect(anchorKey(SLOT_ANCHOR)).toBe("slot:PrimarySaveButton");
    expect(anchorsEqual(INSTANCE_ANCHOR, { kind: "instance", componentId: "btn-1" })).toBe(true);
    expect(anchorsEqual(INSTANCE_ANCHOR, SLOT_ANCHOR)).toBe(false);
  });

  it("resolves a comment anchor against the live preview anchor (for pin placement)", () => {
    // Instance anchor matches by node id, ignores the slot label.
    expect(anchorMatchesPreview(INSTANCE_ANCHOR, { nodeId: "btn-1", label: "other" })).toBe(true);
    expect(anchorMatchesPreview(INSTANCE_ANCHOR, { nodeId: "btn-2", label: "btn-1" })).toBe(false);
    // Slot anchor matches by label.
    expect(anchorMatchesPreview(SLOT_ANCHOR, { nodeId: "x", label: "PrimarySaveButton" })).toBe(true);
    expect(anchorMatchesPreview(SLOT_ANCHOR, { nodeId: "PrimarySaveButton", label: null })).toBe(false);
  });

  it("never matches an anchor missing its identifier (guards against null===null pins)", () => {
    // An instance anchor with no componentId must NOT match a preview whose
    // nodeId is also null — otherwise every unlabeled element would get pinned.
    expect(anchorMatchesPreview({ kind: "instance" }, { nodeId: null, label: "x" })).toBe(false);
    expect(anchorMatchesPreview({ kind: "instance" }, { nodeId: null, label: null })).toBe(false);
    // Likewise a slot anchor with no slotLabel never matches a null label.
    expect(anchorMatchesPreview({ kind: "slot" }, { nodeId: "x", label: null })).toBe(false);
    expect(anchorMatchesPreview({ kind: "slot" }, { nodeId: null, label: null })).toBe(false);
  });
});

// ============================================================================
// Entity-slot anchors (decision 119) — the regenerate-path durable anchor:
// slot label + nearest-ancestor-label disambiguator. Instance ids do not
// survive a Forge regenerate, so Forge-composed documents pin by these.
// ============================================================================

describe("entity-slot anchors (decision 119)", () => {
  beforeEach(() => {
    resetCommentState();
  });

  it("anchorFromPreview flips to entity-slot on the regenerate path (preferDurable)", () => {
    // Even with an instance id available, the durable label wins — that id is
    // re-minted on the next regenerate, the label is not.
    expect(
      anchorFromPreview("slot-cta-12", "cta", {
        preferDurable: true,
        ancestorLabel: "hero",
      }),
    ).toEqual({ kind: "entity-slot", slotLabel: "cta", disambiguator: "hero" });
    // No labeled ancestor -> no disambiguator (matches on label alone).
    expect(anchorFromPreview("slot-cta-12", "cta", { preferDurable: true })).toEqual(
      { kind: "entity-slot", slotLabel: "cta" },
    );
    // Unlabeled element on the regenerate path still falls back to instance.
    expect(anchorFromPreview("node-3", null, { preferDurable: true })).toEqual({
      kind: "instance",
      componentId: "node-3",
    });
    // Off the regenerate path nothing changes (patch_node keeps ids stable).
    expect(anchorFromPreview("btn-1", "cta")).toEqual(INSTANCE_ANCHOR);
  });

  it("entity-slot anchors match by label AND disambiguator — collisions cannot mis-pin", () => {
    const anchor = { kind: "entity-slot" as const, slotLabel: "cta", disambiguator: "hero" };
    expect(
      anchorMatchesPreview(anchor, { nodeId: "x", label: "cta", ancestorLabel: "hero" }),
    ).toBe(true);
    // Same label under a DIFFERENT ancestor is a different entity slot.
    expect(
      anchorMatchesPreview(anchor, { nodeId: "x", label: "cta", ancestorLabel: "footer" }),
    ).toBe(false);
    expect(
      anchorMatchesPreview(anchor, { nodeId: "x", label: "cta", ancestorLabel: null }),
    ).toBe(false);
    // Without a stored disambiguator, the label alone decides.
    expect(
      anchorMatchesPreview(
        { kind: "entity-slot", slotLabel: "cta" },
        { nodeId: "x", label: "cta", ancestorLabel: "anything" },
      ),
    ).toBe(true);
    // Missing identifier never matches (null===null guard).
    expect(
      anchorMatchesPreview({ kind: "entity-slot" }, { nodeId: null, label: null }),
    ).toBe(false);
  });

  it("keys entity-slot anchors by label + disambiguator", () => {
    expect(anchorKey({ kind: "entity-slot", slotLabel: "cta", disambiguator: "hero" })).toBe(
      "entity-slot:cta:hero",
    );
    expect(anchorKey({ kind: "entity-slot", slotLabel: "cta" })).toBe("entity-slot:cta:");
    expect(
      anchorsEqual(
        { kind: "entity-slot", slotLabel: "cta", disambiguator: "hero" },
        { kind: "entity-slot", slotLabel: "cta", disambiguator: "footer" },
      ),
    ).toBe(false);
  });

  it("reanchorComments re-pins OPEN comments only and bumps revision once", () => {
    const store = useCommentStateStore.getState();
    store.addComment({ kind: "instance", componentId: "btn-1" }, "open one");
    store.addComment({ kind: "instance", componentId: "btn-2" }, "resolved one");
    const [open, toResolve] = useCommentStateStore.getState().comments;
    store.resolveComment(toResolve.id);
    const revisionBefore = useCommentStateStore.getState().revision;

    useCommentStateStore.getState().reanchorComments([
      { commentId: open.id, anchor: { kind: "entity-slot", slotLabel: "cta" } },
      { commentId: toResolve.id, anchor: { kind: "entity-slot", slotLabel: "footer" } },
    ]);

    const state = useCommentStateStore.getState();
    expect(state.comments[0].anchor).toEqual({ kind: "entity-slot", slotLabel: "cta" });
    // Resolved comments keep their historical anchor — their pin is history.
    expect(state.comments[1].anchor).toEqual({ kind: "instance", componentId: "btn-2" });
    expect(state.revision).toBe(revisionBefore + 1);

    // No-op updates (same anchor / unknown id) do not bump the revision.
    useCommentStateStore.getState().reanchorComments([
      { commentId: open.id, anchor: { kind: "entity-slot", slotLabel: "cta" } },
      { commentId: "nope", anchor: { kind: "slot", slotLabel: "x" } },
    ]);
    expect(useCommentStateStore.getState().revision).toBe(revisionBefore + 1);
  });
});
