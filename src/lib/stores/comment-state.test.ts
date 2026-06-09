import { beforeEach, describe, expect, it } from "vitest";

import {
  anchorFromPreview,
  anchorKey,
  anchorMatchesPreview,
  anchorsEqual,
  resetCommentState,
  useCommentStateStore,
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
