import { describe, expect, it } from "vitest";

import type { Comment } from "@/lib/stores/comment-state";

import { partitionComments } from "./CommentLayer";

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
