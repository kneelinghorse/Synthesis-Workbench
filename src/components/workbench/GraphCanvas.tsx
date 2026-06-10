"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useDocumentStateStore } from "@/lib/stores/document-state";
import {
  CommentLayer,
  type LiveAnchor,
  type PendingSelection,
} from "@/components/workbench/CommentLayer";
import {
  collectGraphAnchors,
  documentToGraph,
  rectForNodeId,
  type IANodeData,
} from "@/lib/canvas/document-graph";
import { cn } from "@/lib/utils";

/**
 * IA node. Component nodes carry `data-oods-node-id` (= the document node id) so
 * the comment overlay anchors to them exactly as it does over the HTML preview;
 * layout nodes are structural and not commentable.
 */
const IANode = ({ id, data, selected }: NodeProps) => {
  const node = data as IANodeData;
  const isComponent = node.kind === "component";
  return (
    <div
      data-oods-node-id={isComponent ? id : undefined}
      className={cn(
        "rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition",
        isComponent
          ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-100"
          : "border-white/15 bg-slate-800/70 text-white/70",
        selected && "ring-2 ring-indigo-300",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/40" />
      <span className="block max-w-[12rem] truncate">{node.label}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-white/40" />
    </div>
  );
};

const nodeTypes = { ia: IANode };

const GraphCanvasInner = () => {
  const doc = useDocumentStateStore((state) => state.document);
  const graph = useMemo(() => documentToGraph(doc), [doc]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    graph.nodes as Node[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    graph.edges as Edge[],
  );

  // Re-sync the graph when the active document changes.
  useEffect(() => {
    setNodes(graph.nodes as Node[]);
    setEdges(graph.edges as Edge[]);
  }, [graph, setNodes, setEdges]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<LiveAnchor[]>([]);
  const [selection, setSelection] = useState<PendingSelection | null>(null);

  // Re-read node rects from the DOM and feed them to the comment overlay — the
  // parent-side equivalent of the iframe's PREVIEW_ANCHORS broadcast (decision 116).
  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      setAnchors(collectGraphAnchors(container));
    }
  }, []);

  // Recompute after each render of the node set (next frame, so layout settles).
  useEffect(() => {
    const frame = requestAnimationFrame(recompute);
    return () => cancelAnimationFrame(frame);
  }, [nodes, recompute]);

  // Recompute on container resize (panel splits, window resize).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => recompute());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recompute]);

  // Pan/zoom moves every node; refresh rects so pins track the transform.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      requestAnimationFrame(recompute);
    },
    [onNodesChange, recompute],
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const data = node.data as IANodeData;
      if (!data.anchor) {
        return; // structural layout node — not commentable
      }
      const container = containerRef.current;
      const rect = container ? rectForNodeId(container, node.id) : null;
      if (rect) {
        setSelection({ anchor: data.anchor, rect, text: data.label });
      }
    },
    [],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
        No active document to map. Compose or load a design to see its IA graph.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onMove={recompute}
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
      <CommentLayer
        anchors={anchors}
        selection={selection}
        onDismissSelection={() => setSelection(null)}
      />
    </div>
  );
};

/** Sibling graph-canvas review surface. Reuses the comment overlay + store. */
export const GraphCanvas = () => (
  <ReactFlowProvider>
    <GraphCanvasInner />
  </ReactFlowProvider>
);
