/**
 * Document IA → graph mapping for the React Flow canvas (s21-m05).
 *
 * The graph canvas is a sibling review surface that renders the active design
 * document's information architecture (the LayoutNode/ComponentNode tree) as a
 * node/edge graph. It REUSES the comment mechanism: each component node carries
 * the same instance anchor the HTML preview uses (data-oods-node-id = the node
 * id), so a comment pinned on the preview pins to the same node on the canvas and
 * vice-versa — no comment-layer rewrite (decisions 100, 106, 116).
 *
 * `documentToGraph` is pure + side-effect-free (unit-tested). `collectGraphAnchors`
 * reads the rendered canvas DOM to produce the same LiveAnchor[] rect stream the
 * iframe bridge posts as PREVIEW_ANCHORS — but parent-side, because the canvas is
 * trusted React (no sandbox), so the rect contract is reused without an iframe.
 */

import {
  isComponentNode,
  isLayoutNode,
  type DesignDocument,
  type DesignNode,
} from "@/types/document-model";
import type { CommentAnchor } from "@/lib/stores/comment-state";
import type { PreviewAnchorRect } from "@/lib/preview/message-types";
import type { LiveAnchor } from "@/components/workbench/CommentLayer";

// Tidy top-down tree spacing. Leaves are spread evenly on x; a parent centers
// over its children. Dependency-free (no dagre/elk) — sufficient for an IA tree.
const V_SPACING = 120;
const H_SPACING = 220;

export type IANodeKind = "component" | "layout";

export type IANodeData = {
  /** Human label: short component name ("Button") or layout type ("Stack"). */
  label: string;
  kind: IANodeKind;
  /** Component ref ("oods:Button"); absent for layout nodes. */
  ref?: string;
  /**
   * The comment anchor for this node — an instance anchor (componentId = node id)
   * for components, null for structural layout nodes (which have no document id
   * and are not commentable, mirroring the preview where only components anchor).
   */
  anchor: CommentAnchor | null;
  // Index signature keeps the type assignable to React Flow's Node<data> generic.
  [key: string]: unknown;
};

export type IAGraphNode = {
  id: string;
  type: "ia";
  position: { x: number; y: number };
  data: IANodeData;
};

export type IAGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type IAGraph = {
  nodes: IAGraphNode[];
  edges: IAGraphEdge[];
};

/** "oods:Button" → "Button"; leaves anything without the prefix untouched. */
const shortRef = (ref: string): string => ref.replace(/^oods:/, "");

const nodeData = (node: DesignNode): IANodeData =>
  isComponentNode(node)
    ? {
        kind: "component",
        label: shortRef(node.ref),
        ref: node.ref,
        anchor: { kind: "instance", componentId: node.id },
      }
    : {
        kind: "layout",
        label: node.layout.type === "stack" ? "Stack" : "Grid",
        anchor: null,
      };

/**
 * Map a design document to React Flow nodes + edges. Component nodes use their
 * stable document id; layout nodes (which have no id) get a path-derived id so
 * the graph is deterministic. Edges run parent → child. Pure.
 */
export const documentToGraph = (doc: DesignDocument | null): IAGraph => {
  const nodes: IAGraphNode[] = [];
  const edges: IAGraphEdge[] = [];
  if (!doc) {
    return { nodes, edges };
  }

  let nextLeafX = 0;

  const walk = (
    node: DesignNode,
    depth: number,
    parentId: string | null,
    path: string,
  ): number => {
    const id = isComponentNode(node) ? node.id : `layout-${path}`;
    const children = isLayoutNode(node) ? node.children : [];

    let x: number;
    if (children.length === 0) {
      x = nextLeafX;
      nextLeafX += H_SPACING;
    } else {
      const childXs = children.map((child, index) =>
        walk(child, depth + 1, id, `${path}.${index}`),
      );
      x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    }

    nodes.push({
      id,
      type: "ia",
      position: { x, y: depth * V_SPACING },
      data: nodeData(node),
    });
    if (parentId) {
      edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
    }
    return x;
  };

  walk(doc.root, 0, null, "0");
  return { nodes, edges };
};

/**
 * Read the rendered canvas DOM for anchored nodes and report their rects in the
 * container's coordinate space — the same {nodeId, label, rect} shape the iframe
 * bridge broadcasts as PREVIEW_ANCHORS (decision 116), so the existing
 * CommentLayer overlay consumes it unchanged. Parent-side (no sandbox) because
 * the canvas is trusted React, not untrusted Forge HTML.
 */
export const collectGraphAnchors = (container: HTMLElement): LiveAnchor[] => {
  const base = container.getBoundingClientRect();
  const elements = container.querySelectorAll<HTMLElement>(
    "[data-oods-node-id],[data-oods-label]",
  );
  return Array.from(elements).map((element): LiveAnchor => {
    const rect = element.getBoundingClientRect();
    const position: PreviewAnchorRect = {
      left: rect.left - base.left,
      top: rect.top - base.top,
      width: rect.width,
      height: rect.height,
    };
    return {
      nodeId: element.getAttribute("data-oods-node-id"),
      label: element.getAttribute("data-oods-label"),
      rect: position,
    };
  });
};

/** Rect (container-relative) for a single node id, or null if not in the DOM. */
export const rectForNodeId = (
  container: HTMLElement,
  nodeId: string,
): PreviewAnchorRect | null => {
  const match = collectGraphAnchors(container).find(
    (anchor) => anchor.nodeId === nodeId,
  );
  return match ? match.rect : null;
};
