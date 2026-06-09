import { beforeEach, describe, expect, it } from "vitest";

import {
  resetCommentState,
  useCommentStateStore,
  type Comment,
} from "@/lib/stores/comment-state";
import type { DesignDocument } from "@/types/document-model";

import {
  formatResolvedComments,
  formatReviewComments,
  formatReviewContext,
} from "./review-context";

const comment = (over: Partial<Comment> = {}): Comment => ({
  id: "c1",
  anchor: { kind: "instance", componentId: "btn-1" },
  text: "make it smaller",
  createdAt: "2026-06-09T00:00:00.000Z",
  resolved: false,
  ...over,
});

const DOC: DesignDocument = {
  metadata: { title: "T" },
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
};

describe("formatReviewComments", () => {
  it("lists only OPEN comments, each with its anchor", () => {
    const out = formatReviewComments([
      comment({ id: "a", text: "make it smaller" }),
      comment({
        id: "b",
        anchor: { kind: "slot", slotLabel: "Title" },
        text: "bolder please",
      }),
      comment({ id: "c", text: "already handled", resolved: true }),
    ]);

    expect(out).toContain("node btn-1");
    expect(out).toContain("make it smaller");
    expect(out).toContain('slot "Title"');
    expect(out).toContain("bolder please");
    // Resolved comments are not actionable noise for the agent.
    expect(out).not.toContain("already handled");
  });

  it("returns an empty string when there are no open comments", () => {
    expect(formatReviewComments([])).toBe("");
    expect(formatReviewComments([comment({ resolved: true })])).toBe("");
  });

  it("surfaces each open comment's id so the agent can echo it into addressesCommentIds", () => {
    const out = formatReviewComments([comment({ id: "c-42", text: "tighten spacing" })]);
    // The id is the durable linkage: the agent copies it into the tool call so
    // the pin clears on Accept and the change is not re-proposed.
    expect(out).toContain("[c-42]");
    expect(out).toContain("addressesCommentIds");
  });
});

describe("formatResolvedComments", () => {
  it("lists resolved comments as 'do not re-propose', newest first, bounded", () => {
    const out = formatResolvedComments(
      [
        comment({ id: "old", text: "older fix", resolved: true, resolvedAt: "2026-06-09T01:00:00.000Z" }),
        comment({ id: "new", text: "newer fix", resolved: true, resolvedAt: "2026-06-09T03:00:00.000Z" }),
        comment({ id: "mid", text: "mid fix", resolved: true, resolvedAt: "2026-06-09T02:00:00.000Z" }),
      ],
      2,
    );

    expect(out).toContain("do not re-propose");
    // Newest two by resolvedAt survive the cap; the oldest is dropped so the
    // per-turn prompt can't grow with the full resolution history.
    expect(out).toContain("newer fix");
    expect(out).toContain("mid fix");
    expect(out).not.toContain("older fix");
  });

  it("returns '' when there are no resolved comments", () => {
    expect(formatResolvedComments([])).toBe("");
    expect(formatResolvedComments([comment({ resolved: false })])).toBe("");
  });
});

describe("formatReviewContext", () => {
  it("packages the document, token overrides, and open comments", () => {
    const out = formatReviewContext({
      document: DOC,
      tokenChanges: { "colors.primary": { from: "#000000", to: "#3366ff" } },
      comments: [comment({ text: "tweak the cta" })],
    });

    expect(out).toContain("CURRENT DESIGN");
    expect(out).toContain('"id": "btn-1"'); // document JSON included for targeting
    expect(out).toContain("colors.primary: #000000 → #3366ff");
    expect(out).toContain("tweak the cta");
  });

  it("returns empty when there is nothing live to package", () => {
    expect(formatReviewContext({ document: null })).toBe("");
    expect(
      formatReviewContext({
        document: null,
        comments: [comment({ resolved: true })],
      }),
    ).toBe("");
  });

  it("appends the resolved 'do not re-propose' digest alongside the live document", () => {
    const out = formatReviewContext({
      document: DOC,
      comments: [
        comment({ text: "done already", resolved: true, resolvedAt: "2026-06-09T01:00:00.000Z" }),
      ],
    });

    // The document cleared the early return, so the resolved digest rides along
    // to give the agent closure on the handled critique.
    expect(out).toContain("do not re-propose");
    expect(out).toContain("done already");
  });

  it("still surfaces comments when no document is loaded yet", () => {
    const out = formatReviewContext({
      document: null,
      comments: [comment({ text: "orphan critique" })],
    });

    expect(out).toContain("No document loaded yet.");
    expect(out).toContain("orphan critique");
  });

  it("falls back to a compact id/ref outline when the document is too large to inline", () => {
    // Keep the per-turn system prompt bounded: a big doc must NOT dump full JSON.
    const children = Array.from({ length: 200 }, (_, i) => ({
      nodeType: "component" as const,
      id: `node-${i}`,
      ref: "oods:Button",
      props: { label: `Button number ${i} with a reasonably long label here` },
    }));
    const bigDoc: DesignDocument = {
      metadata: { title: "big" },
      root: { nodeType: "layout", layout: { type: "stack", gap: 8 }, children },
    };

    const out = formatReviewContext({ document: bigDoc });

    expect(out).toContain("Outline only");
    expect(out).toContain("node-0 (oods:Button)");
    expect(out).toContain("node-199 (oods:Button)");
    // The full pretty-printed JSON is NOT inlined.
    expect(out).not.toContain('"nodeType": "component"');
  });
});

// The bug this mission fixes (s20-m10): an accepted change left the originating
// comment OPEN, so formatReviewComments re-fed it every turn and the agent
// re-proposed forever. This wires the real store through the prompt formatters
// to prove the loop is broken — and that the agent isn't left stranded.
describe("comment→change loop is broken end-to-end", () => {
  beforeEach(() => {
    resetCommentState();
  });

  it("an accepted change drops the comment from the open list and into the resolved digest", () => {
    useCommentStateStore
      .getState()
      .addComment({ kind: "instance", componentId: "card-1" }, "rename to feedback card");

    // Turn 1: the open comment is actionable in the prompt.
    const turn1 = useCommentStateStore.getState().comments;
    expect(formatReviewComments(turn1)).toContain("rename to feedback card");
    expect(formatResolvedComments(turn1)).toBe("");

    // Human Accepts a patch_node targeting card-1 — the DocumentToolUI Accept
    // path — with NO declared id, so the anchor net does the linking.
    useCommentStateStore.getState().resolveCommentsForChange({ nodeId: "card-1" });

    // Turn 2: the comment is GONE from the actionable list (no re-proposal)…
    const turn2 = useCommentStateStore.getState().comments;
    expect(formatReviewComments(turn2)).toBe("");
    // …but acknowledged as handled, so the agent isn't stranded ("can't find it").
    expect(formatResolvedComments(turn2)).toContain("rename to feedback card");
  });

  it("an accepted set_document resolves ONLY the comment ids the agent declared", () => {
    // The primary linkage: the agent echoes a comment id into addressesCommentIds.
    // A set_document rewrite has no nodeId, so ONLY the declared id may resolve —
    // an unrelated open comment must stay actionable.
    const state = () => useCommentStateStore.getState();
    state().addComment({ kind: "instance", componentId: "hero" }, "instance critique");
    state().addComment({ kind: "slot", slotLabel: "Footer" }, "slot critique");
    const footerId = state().comments.find((c) => c.text === "slot critique")!.id;

    // Accept a set_document that declared only the footer comment id.
    state().resolveCommentsForChange({ commentIds: [footerId] });

    const open = formatReviewComments(state().comments);
    // The undeclared instance comment is still open (not wrongly resolved)…
    expect(open).toContain("instance critique");
    // …and the declared slot comment has left the open list and is acknowledged.
    expect(open).not.toContain("slot critique");
    expect(formatResolvedComments(state().comments)).toContain("slot critique");
  });

  it("a manually-resolved comment leaves the open list but is acknowledged (no stranding)", () => {
    // Criterion 3: resolving manually means DONE, not lost. The agent must see
    // it as handled rather than have it vanish mid-conversation.
    const state = () => useCommentStateStore.getState();
    state().addComment({ kind: "instance", componentId: "cta" }, "manual critique");
    const id = state().comments[0].id;

    state().resolveComment(id); // the CommentLayer "Resolve" button path (by="user")

    expect(formatReviewComments(state().comments)).toBe("");
    expect(formatResolvedComments(state().comments)).toContain("manual critique");
  });
});
