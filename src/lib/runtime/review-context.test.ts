import { describe, expect, it } from "vitest";

import type { Comment } from "@/lib/stores/comment-state";
import type { DesignDocument } from "@/types/document-model";

import { formatReviewComments, formatReviewContext } from "./review-context";

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
