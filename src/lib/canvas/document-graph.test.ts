import { describe, expect, it } from "vitest";

import type { DesignDocument } from "@/types/document-model";
import {
  collectGraphAnchors,
  documentToGraph,
  rectForNodeId,
} from "./document-graph";

const componentRootDoc = (): DesignDocument => ({
  metadata: { title: "single" },
  root: { nodeType: "component", id: "btn-1", ref: "oods:Button", props: {} },
});

// stack { Hero, grid { Card card-1, Card card-2 } }
const nestedDoc = (): DesignDocument => ({
  metadata: { title: "nested" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 8 },
    children: [
      { nodeType: "component", id: "hero", ref: "oods:Hero", props: {} },
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 2 },
        children: [
          { nodeType: "component", id: "card-1", ref: "oods:Card", props: {} },
          { nodeType: "component", id: "card-2", ref: "oods:Card", props: {} },
        ],
      },
    ],
  },
});

const nodeById = (graph: ReturnType<typeof documentToGraph>, id: string) =>
  graph.nodes.find((node) => node.id === id);

describe("documentToGraph", () => {
  it("returns an empty graph for no document", () => {
    expect(documentToGraph(null)).toEqual({ nodes: [], edges: [] });
  });

  it("maps a component root to one anchored node with no edges", () => {
    const graph = documentToGraph(componentRootDoc());

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes[0]).toMatchObject({
      id: "btn-1",
      type: "ia",
      data: {
        kind: "component",
        label: "Button", // oods: prefix stripped
        ref: "oods:Button",
        anchor: { kind: "instance", componentId: "btn-1" },
      },
    });
  });

  it("maps the nested IA tree to nodes + parent→child edges", () => {
    const graph = documentToGraph(nestedDoc());

    // 1 stack + Hero + 1 grid + 2 cards
    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(4);

    // Layout nodes get path-derived ids and are NOT commentable (null anchor).
    expect(nodeById(graph, "layout-0")?.data).toMatchObject({
      kind: "layout",
      label: "Stack",
      anchor: null,
    });
    expect(nodeById(graph, "layout-0.1")?.data).toMatchObject({
      kind: "layout",
      label: "Grid",
      anchor: null,
    });

    // Component nodes keep their stable document id as the instance anchor.
    expect(nodeById(graph, "hero")?.data.anchor).toEqual({
      kind: "instance",
      componentId: "hero",
    });
    expect(nodeById(graph, "card-2")?.data.anchor).toEqual({
      kind: "instance",
      componentId: "card-2",
    });

    // Edges follow the tree: stack→Hero, stack→grid, grid→each card.
    const edgePairs = graph.edges.map((edge) => `${edge.source}->${edge.target}`);
    expect(edgePairs).toEqual(
      expect.arrayContaining([
        "layout-0->hero",
        "layout-0->layout-0.1",
        "layout-0.1->card-1",
        "layout-0.1->card-2",
      ]),
    );
  });

  it("lays nodes out top-down by depth (y grows with nesting)", () => {
    const graph = documentToGraph(nestedDoc());
    expect(nodeById(graph, "layout-0")?.position.y).toBe(0);
    expect(nodeById(graph, "hero")?.position.y).toBe(120);
    expect(nodeById(graph, "card-1")?.position.y).toBe(240);
  });
});

// ----------------------------------------------------------------------------
// collectGraphAnchors / rectForNodeId — the parent-side rect stream that feeds
// the comment overlay (the PREVIEW_ANCHORS contract, decision 116, no iframe).
// ----------------------------------------------------------------------------

const stubRect = (
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) => {
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
};

describe("collectGraphAnchors", () => {
  it("reports container-relative rects for anchored elements and skips the rest", () => {
    const container = document.createElement("div");
    stubRect(container, { left: 100, top: 50, width: 800, height: 600 });

    const componentEl = document.createElement("div");
    componentEl.setAttribute("data-oods-node-id", "btn-1");
    stubRect(componentEl, { left: 140, top: 90, width: 120, height: 32 });

    const slotEl = document.createElement("div");
    slotEl.setAttribute("data-oods-label", "hero-cta");
    stubRect(slotEl, { left: 300, top: 200, width: 64, height: 24 });

    const plainEl = document.createElement("div"); // no anchor attrs
    stubRect(plainEl, { left: 0, top: 0, width: 10, height: 10 });

    container.append(componentEl, slotEl, plainEl);

    const anchors = collectGraphAnchors(container);

    expect(anchors).toHaveLength(2); // plainEl excluded
    // Rects are translated into the container's coordinate space (minus 100/50).
    expect(anchors).toContainEqual({
      nodeId: "btn-1",
      label: null,
      rect: { left: 40, top: 40, width: 120, height: 32 },
    });
    expect(anchors).toContainEqual({
      nodeId: null,
      label: "hero-cta",
      rect: { left: 200, top: 150, width: 64, height: 24 },
    });
  });

  it("rectForNodeId returns the rect for a known node id, null otherwise", () => {
    const container = document.createElement("div");
    stubRect(container, { left: 0, top: 0, width: 500, height: 500 });
    const el = document.createElement("div");
    el.setAttribute("data-oods-node-id", "card-1");
    stubRect(el, { left: 10, top: 20, width: 100, height: 50 });
    container.append(el);

    expect(rectForNodeId(container, "card-1")).toEqual({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
    });
    expect(rectForNodeId(container, "missing")).toBeNull();
  });
});
