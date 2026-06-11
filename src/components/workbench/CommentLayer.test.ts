import { describe, expect, it } from "vitest";

import type { Comment, CommentAnchor } from "@/lib/stores/comment-state";

import { partitionComments, rectFor, type LiveAnchor } from "./CommentLayer";

const comment = (over: Partial<Comment>): Comment => ({
  id: "c",
  anchor: { kind: "instance", componentId: "n" },
  text: "t",
  createdAt: "2026-06-09T00:00:00.000Z",
  resolved: false,
  ...over,
});

describe("partitionComments", () => {
  it("keeps resolved comments OUT of the always-visible open list", () => {
    // The bug (s20-m11): resolved comments rendered inline in the side panel and
    // occluded the canvas. They must move to the separate history group.
    const { open, resolved } = partitionComments([
      comment({ id: "a" }),
      comment({ id: "b", resolved: true, resolvedAt: "2026-06-09T01:00:00.000Z" }),
    ]);

    expect(open.map((c) => c.id)).toEqual(["a"]);
    expect(resolved.map((c) => c.id)).toEqual(["b"]);
  });

  it("orders the resolved/history group newest-first so recent closures surface", () => {
    const { resolved } = partitionComments([
      comment({ id: "old", resolved: true, resolvedAt: "2026-06-09T01:00:00.000Z" }),
      comment({ id: "new", resolved: true, resolvedAt: "2026-06-09T03:00:00.000Z" }),
      comment({ id: "mid", resolved: true, resolvedAt: "2026-06-09T02:00:00.000Z" }),
    ]);

    expect(resolved.map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });

  it("preserves creation order for the open list", () => {
    const { open } = partitionComments([
      comment({ id: "1" }),
      comment({ id: "2" }),
      comment({ id: "3" }),
    ]);

    expect(open.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });
});

// ============================================================================
// rectFor — live-pin resolution. Entity-slot anchors (decision 119) pin only
// on an UNAMBIGUOUS match: attaching an "orphaned" colliding-label comment to
// an arbitrary collider would be a silent mis-pin, and the detached badge
// (computed as !rectFor) would never show. Found by the s21-m04 adversarial
// review; instance/slot anchors keep their v1 first-match behavior.
// ============================================================================

describe("rectFor", () => {
  const rect = (top: number) => ({ top, left: 0, width: 10, height: 10 });

  it("refuses an ambiguous entity-slot match — the comment renders detached, never mis-pinned", () => {
    const anchor: CommentAnchor = { kind: "entity-slot", slotLabel: "hero" };
    const colliding: LiveAnchor[] = [
      { nodeId: "slot-hero-2", label: "hero", rect: rect(1) },
      { nodeId: "slot-hero-9", label: "hero", rect: rect(2) },
    ];

    expect(rectFor(anchor, colliding)).toBeNull();
  });

  it("pins an entity-slot anchor on a unique match", () => {
    const anchor: CommentAnchor = { kind: "entity-slot", slotLabel: "hero" };
    const anchors: LiveAnchor[] = [
      { nodeId: "slot-hero-2", label: "hero", rect: rect(1) },
      { nodeId: "slot-cta-3", label: "cta", rect: rect(2) },
    ];

    expect(rectFor(anchor, anchors)).toEqual(rect(1));
  });

  it("keeps v1 first-match behavior for instance and plain slot anchors", () => {
    const anchors: LiveAnchor[] = [
      { nodeId: "card-1", label: "card", rect: rect(1) },
      { nodeId: "card-2", label: "card", rect: rect(2) },
    ];

    expect(rectFor({ kind: "instance", componentId: "card-2" }, anchors)).toEqual(rect(2));
    // Pre-existing slot semantics unchanged (backward compat, invariant 4).
    expect(rectFor({ kind: "slot", slotLabel: "card" }, anchors)).toEqual(rect(1));
  });
});
