import { describe, expect, it } from "vitest";

import { buildFoundryFragmentRenderInput } from "./foundry-fragment-adapter";
import {
  FORGE_COMPOSED_TAG,
  isForgeComposedDocument,
  uiSchemaToDesignDocument,
} from "./foundry-compose-adapter";
import composeFixture from "./__fixtures__/design-compose-landing.json";
import type { ComponentNode, DesignNode } from "@/types/document-model";
import { isComponentNode, isLayoutNode } from "@/types/document-model";

// Captured live from design_compose (landing intent) against the local :4466
// bridge on 2026-06-10 — the real seed shape Option B converts.
const fixtureSchema = composeFixture.schema as unknown;

const collectComponentNodes = (node: DesignNode): ComponentNode[] => {
  if (isComponentNode(node)) {
    return [node];
  }
  if (isLayoutNode(node)) {
    return node.children.flatMap(collectComponentNodes);
  }
  return [];
};

describe("uiSchemaToDesignDocument", () => {
  it("preserves Forge instance ids AND durable slot labels on every leaf component", () => {
    // The whole point of the converter: both halves of the comment-anchor
    // contract must survive into the document model, or regenerated previews
    // lose data-oods-node-id/data-oods-label and every pinned comment orphans.
    const { document } = uiSchemaToDesignDocument(fixtureSchema);
    const components = collectComponentNodes(document.root);

    expect(components.map((node) => node.id)).toEqual([
      "slot-hero-2",
      "slot-hero-cta-3",
      "slot-section-0-5",
      "slot-section-1-7",
      "slot-section-2-9",
      "slot-cta-12",
      "slot-footer-14",
    ]);
    expect(components.map((node) => node.meta?.label)).toEqual([
      "hero",
      "hero-cta",
      "section-0",
      "section-1",
      "section-2",
      "cta",
      "footer",
    ]);
    expect(components.map((node) => node.ref)).toEqual([
      "oods:DetailHeader",
      "oods:Button",
      "oods:Card",
      "oods:Card",
      "oods:Card",
      "oods:Button",
      "oods:AuditTimeline",
    ]);
  });

  it("maps Forge containers to native layout nodes (stack stays, inline becomes a row grid)", () => {
    const { document } = uiSchemaToDesignDocument(fixtureSchema);
    const root = document.root;
    if (!isLayoutNode(root)) {
      throw new Error("expected the screen to convert to a layout root");
    }
    expect(root.layout.type).toBe("stack");
    expect(root.children).toHaveLength(4);

    const [hero, sections, cta, footer] = root.children;
    if (!isLayoutNode(hero) || !isLayoutNode(sections) || !isLayoutNode(cta) || !isLayoutNode(footer)) {
      throw new Error("expected all four landing regions to be layout nodes");
    }
    // hero: Forge stack align=center survives as a stack alignment.
    expect(hero.layout).toEqual({ type: "stack", align: "center" });
    // cta/footer: Forge `inline` has no Workbench equivalent — a one-row grid
    // keeps the children horizontal with the existing layout engine.
    expect(cta.layout).toEqual({ type: "grid", columns: 1 });
    expect(footer.layout).toEqual({ type: "grid", columns: 1 });
  });

  it("stamps the forge-composed tag so the comment layer can flip to durable anchors", () => {
    const { document } = uiSchemaToDesignDocument(fixtureSchema, {
      title: "Landing seed",
    });
    expect(document.metadata.title).toBe("Landing seed");
    expect(document.metadata.tags).toContain(FORGE_COMPOSED_TAG);
    expect(isForgeComposedDocument(document)).toBe(true);
    expect(
      isForgeComposedDocument({ metadata: { tags: ["anything-else"] } }),
    ).toBe(false);
  });

  it("does not propagate the composed schema version into document metadata", () => {
    // metadata.version drives the fragments render DSL version — the composed
    // schema version (2026.02) describes compose output, not the render
    // contract, so inheriting it would silently change every repl render call.
    const { document } = uiSchemaToDesignDocument(fixtureSchema);
    expect(document.metadata.version).toBeUndefined();
  });

  it("converts cleanly with zero warnings on the real landing seed", () => {
    const { warnings } = uiSchemaToDesignDocument(fixtureSchema);
    expect(warnings).toEqual([]);
  });

  it("round-trips composed labels out to the fragments render input", () => {
    // Integration with the forward adapter: the persisted meta.label must be
    // what Forge receives on render, because that is what comes back as
    // data-oods-label — the anchor comments pin to.
    const { document } = uiSchemaToDesignDocument(fixtureSchema);
    const { renderInput } = buildFoundryFragmentRenderInput(document);
    const children = renderInput.schema.screens[0].children;

    expect(children.map((child) => child.id)).toEqual([
      "slot-hero-2",
      "slot-hero-cta-3",
      "slot-section-0-5",
      "slot-section-1-7",
      "slot-section-2-9",
      "slot-cta-12",
      "slot-footer-14",
    ]);
    expect(children.map((child) => child.meta?.label)).toEqual([
      "hero",
      "hero-cta",
      "section-0",
      "section-1",
      "section-2",
      "cta",
      "footer",
    ]);
  });

  it("drops a container label with a loud warning instead of mis-pinning it", () => {
    // Decision-137 edge: a multi-component slot wrapper carries the label. The
    // document model cannot represent it (LayoutNode has no meta), so the
    // converter must say so — silently losing it would hide that comments on
    // this slot cannot re-anchor (decision 141 conservatism).
    const { document, warnings } = uiSchemaToDesignDocument({
      version: "2026.02",
      screens: [
        {
          id: "screen-1",
          component: "Stack",
          children: [
            {
              id: "slot-hero-1",
              component: "Stack",
              meta: { label: "hero" },
              children: [
                { id: "hero-copy-2", component: "Text" },
                { id: "hero-cta-3", component: "Button" },
              ],
            },
          ],
        },
      ],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Slot label "hero"');
    expect(warnings[0]).toContain("slot-hero-1");
    const components = collectComponentNodes(document.root);
    expect(components.map((node) => node.id)).toEqual([
      "hero-copy-2",
      "hero-cta-3",
    ]);
    expect(components.every((node) => node.meta === undefined)).toBe(true);
  });

  it("skips leaves with unusable component names or missing ids, with warnings", () => {
    const { document, warnings } = uiSchemaToDesignDocument({
      screens: [
        {
          id: "screen-1",
          component: "Stack",
          children: [
            { id: "ok-1", component: "Button", meta: { label: "cta" } },
            { id: "bad-name-2", component: "not-a-component" },
            { component: "Card" },
          ],
        },
      ],
    });

    const components = collectComponentNodes(document.root);
    expect(components.map((node) => node.id)).toEqual(["ok-1"]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("not-a-component");
    expect(warnings[1]).toContain("node id is missing");
  });

  it("wraps multiple screens in a stack root", () => {
    const { document } = uiSchemaToDesignDocument({
      screens: [
        {
          id: "screen-1",
          component: "Stack",
          children: [{ id: "a-1", component: "Button" }],
        },
        {
          id: "screen-2",
          component: "Stack",
          children: [{ id: "b-1", component: "Card" }],
        },
      ],
    });

    if (!isLayoutNode(document.root)) {
      throw new Error("expected a layout root");
    }
    expect(document.root.children).toHaveLength(2);
    expect(collectComponentNodes(document.root).map((node) => node.id)).toEqual(
      ["a-1", "b-1"],
    );
  });

  it("throws on schemas with no screens or nothing convertible", () => {
    expect(() => uiSchemaToDesignDocument({ screens: "nope" })).toThrow(
      /malformed/,
    );
    expect(() =>
      uiSchemaToDesignDocument({
        screens: [{ id: "screen-1", component: "Stack", children: [{}] }],
      }),
    ).toThrow(/no usable nodes/);
  });
});
