/**
 * Document Tools Tests
 *
 * Tests for set_document and patch_node tool executors.
 * Validates document creation, node patching, document-state updates,
 * and error handling.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { DesignDocument, ComponentNode } from "../src/types/document-model";
import {
  executeSetDocument,
  executePatchNode,
  countNodes,
  countComponents,
  findNodeById,
  type SetDocumentToolArgs,
  type PatchNodeToolArgs,
} from "../src/lib/runtime/tools/document-tools";
import { useDocumentStateStore } from "../src/lib/stores/document-state";

// ============================================================================
// Fixtures
// ============================================================================

const DASHBOARD_DOC: DesignDocument = {
  metadata: { title: "Dashboard" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 24 },
    children: [
      {
        nodeType: "component",
        id: "nav",
        ref: "oods:Navbar",
        props: { brand: "MyApp" },
      },
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 2, gap: 16 },
        children: [
          {
            nodeType: "component",
            id: "card-1",
            ref: "oods:Card",
            props: { title: "Users", value: "1.2k" },
          },
          {
            nodeType: "component",
            id: "card-2",
            ref: "oods:Card",
            props: { title: "Revenue", value: "$42k" },
          },
        ],
      },
      {
        nodeType: "component",
        id: "footer",
        ref: "oods:Footer",
        props: {},
      },
    ],
  },
};

const SIMPLE_DOC: DesignDocument = {
  metadata: { title: "Simple" },
  root: {
    nodeType: "component",
    id: "solo-btn",
    ref: "oods:Button",
    props: { text: "Click" },
  },
};

// ============================================================================
// Helpers
// ============================================================================

const getDocState = () => useDocumentStateStore.getState();

function makeSetArgs(
  overrides: Partial<SetDocumentToolArgs> = {},
): SetDocumentToolArgs {
  return {
    requestId: `test-${Date.now()}`,
    document: DASHBOARD_DOC,
    ...overrides,
  };
}

function makePatchArgs(
  overrides: Partial<PatchNodeToolArgs> = {},
): PatchNodeToolArgs {
  return {
    requestId: `test-${Date.now()}`,
    nodeId: "card-1",
    ...overrides,
  };
}

// ============================================================================
// Tests: Utilities
// ============================================================================

describe("document-tools utilities", () => {
  describe("countNodes", () => {
    it("should count a single component", async () => {
      expect(countNodes(SIMPLE_DOC.root)).toBe(1);
    });

    it("should count all nodes in a nested tree", async () => {
      // stack(1) + nav(1) + grid(1) + card1(1) + card2(1) + footer(1) = 6
      expect(countNodes(DASHBOARD_DOC.root)).toBe(6);
    });
  });

  describe("countComponents", () => {
    it("should count components only", async () => {
      // nav + card1 + card2 + footer = 4
      expect(countComponents(DASHBOARD_DOC.root)).toBe(4);
    });

    it("should count a single component", async () => {
      expect(countComponents(SIMPLE_DOC.root)).toBe(1);
    });
  });

  describe("findNodeById", () => {
    it("should find a node by ID", async () => {
      const node = findNodeById(DASHBOARD_DOC.root, "card-1");
      expect(node).toBeDefined();
      expect(node!.id).toBe("card-1");
      expect(node!.ref).toBe("oods:Card");
    });

    it("should find deeply nested node", async () => {
      const node = findNodeById(DASHBOARD_DOC.root, "footer");
      expect(node).toBeDefined();
      expect(node!.ref).toBe("oods:Footer");
    });

    it("should return null for non-existent ID", async () => {
      const node = findNodeById(DASHBOARD_DOC.root, "not-exists");
      expect(node).toBeNull();
    });

    it("should find root component node", async () => {
      const node = findNodeById(SIMPLE_DOC.root, "solo-btn");
      expect(node).toBeDefined();
      expect(node!.ref).toBe("oods:Button");
    });
  });
});

// ============================================================================
// Tests: executeSetDocument
// ============================================================================

describe("executeSetDocument", () => {
  beforeEach(() => {
    getDocState().reset();
  });

  it("should set the active document", async () => {
    const result = await executeSetDocument(makeSetArgs());

    expect(result.saved).toBe(true);
    expect(result.nodeCount).toBe(6);
    expect(result.componentCount).toBe(4);
    expect(result.resolvedAt).toBeTruthy();
  });

  it("should update the document-state store", async () => {
    await executeSetDocument(makeSetArgs());

    const state = getDocState();
    expect(state.document).toEqual(DASHBOARD_DOC);
    expect(state.revision).toBe(1);
  });

  it("should include slug in result when provided", async () => {
    const result = await executeSetDocument(
      makeSetArgs({ slug: "my-dashboard" }),
    );

    expect(result.slug).toBe("my-dashboard");
  });

  it("should fail when no document is provided", async () => {
    const result = await executeSetDocument(
      makeSetArgs({ document: undefined }),
    );

    expect(result.saved).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("should fail when document has no root", async () => {
    const result = await executeSetDocument(
      makeSetArgs({ document: { metadata: {}, root: undefined as any } }),
    );

    expect(result.saved).toBe(false);
  });

  it("should replace the previous document", async () => {
    await executeSetDocument(makeSetArgs({ document: DASHBOARD_DOC }));
    await executeSetDocument(makeSetArgs({ document: SIMPLE_DOC }));

    const state = getDocState();
    expect(state.document).toEqual(SIMPLE_DOC);
    expect(state.revision).toBe(2);
  });

  it("should handle a single component root", async () => {
    const result = await executeSetDocument(
      makeSetArgs({ document: SIMPLE_DOC }),
    );

    expect(result.saved).toBe(true);
    expect(result.nodeCount).toBe(1);
    expect(result.componentCount).toBe(1);
  });
});

// ============================================================================
// Tests: executePatchNode
// ============================================================================

describe("executePatchNode", () => {
  beforeEach(() => {
    getDocState().reset();
  });

  it("should fail when no active document exists", async () => {
    const result = executePatchNode(makePatchArgs());

    expect(result.patched).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("No active document");
  });

  it("should patch component props", async () => {
    await executeSetDocument(makeSetArgs());

    const result = executePatchNode(
      makePatchArgs({
        nodeId: "card-1",
        props: { title: "Active Users", value: "2.5k" },
      }),
    );

    expect(result.patched).toBe(true);
    expect(result.nodeId).toBe("card-1");

    const state = getDocState();
    const patched = findNodeById(state.document!.root, "card-1");
    expect(patched!.props.title).toBe("Active Users");
    expect(patched!.props.value).toBe("2.5k");
  });

  it("should merge props without replacing existing ones", async () => {
    await executeSetDocument(makeSetArgs());

    executePatchNode(
      makePatchArgs({
        nodeId: "card-1",
        props: { icon: "users" },
      }),
    );

    const state = getDocState();
    const patched = findNodeById(state.document!.root, "card-1");
    // Original props preserved
    expect(patched!.props.title).toBe("Users");
    expect(patched!.props.value).toBe("1.2k");
    // New prop added
    expect(patched!.props.icon).toBe("users");
  });

  it("should patch component ref", async () => {
    await executeSetDocument(makeSetArgs());

    executePatchNode(
      makePatchArgs({
        nodeId: "card-1",
        ref: "oods:MetricCard",
      }),
    );

    const state = getDocState();
    const patched = findNodeById(state.document!.root, "card-1");
    expect(patched!.ref).toBe("oods:MetricCard");
  });

  it("should fail for non-existent node ID", async () => {
    await executeSetDocument(makeSetArgs());

    const result = executePatchNode(
      makePatchArgs({ nodeId: "not-exists" }),
    );

    expect(result.patched).toBe(false);
    expect(result.errors![0]).toContain("not found");
  });

  it("should increment revision on patch", async () => {
    await executeSetDocument(makeSetArgs());
    const revBefore = getDocState().revision;

    executePatchNode(
      makePatchArgs({ nodeId: "card-1", props: { title: "Updated" } }),
    );

    expect(getDocState().revision).toBe(revBefore + 1);
  });

  it("should not mutate the original document", async () => {
    await executeSetDocument(makeSetArgs());
    const originalDoc = getDocState().document;
    const originalTitle = findNodeById(originalDoc!.root, "card-1")!.props
      .title;

    executePatchNode(
      makePatchArgs({ nodeId: "card-1", props: { title: "Changed" } }),
    );

    // The original doc object should be unchanged
    // (patch creates a clone)
    const newDoc = getDocState().document;
    expect(newDoc).not.toBe(originalDoc);
    expect(findNodeById(newDoc!.root, "card-1")!.props.title).toBe("Changed");
  });

  it("should patch root component node", async () => {
    await executeSetDocument(makeSetArgs({ document: SIMPLE_DOC }));

    const result = executePatchNode(
      makePatchArgs({
        nodeId: "solo-btn",
        props: { text: "Updated Text" },
      }),
    );

    expect(result.patched).toBe(true);
    const state = getDocState();
    const patched = findNodeById(state.document!.root, "solo-btn");
    expect(patched!.props.text).toBe("Updated Text");
  });
});

// ============================================================================
// Tests: End-to-End Document Authoring Flow
// ============================================================================

describe("Document Authoring E2E Flow", () => {
  beforeEach(() => {
    getDocState().reset();
  });

  it("should support create → patch → verify workflow", async () => {
    // 1. LLM creates a document
    const setResult = await executeSetDocument(makeSetArgs());
    expect(setResult.saved).toBe(true);
    expect(setResult.componentCount).toBe(4);

    // 2. LLM patches a node
    const patchResult = executePatchNode(
      makePatchArgs({
        nodeId: "nav",
        props: { brand: "UpdatedApp", theme: "dark" },
      }),
    );
    expect(patchResult.patched).toBe(true);

    // 3. Verify final state
    const doc = getDocState().document!;
    const nav = findNodeById(doc.root, "nav")!;
    expect(nav.props.brand).toBe("UpdatedApp");
    expect(nav.props.theme).toBe("dark");

    // Other nodes unchanged
    const card1 = findNodeById(doc.root, "card-1")!;
    expect(card1.props.title).toBe("Users");
  });

  it("should support replacing document entirely", async () => {
    // Set initial doc
    await executeSetDocument(makeSetArgs({ document: DASHBOARD_DOC }));
    expect(getDocState().document!.metadata.title).toBe("Dashboard");

    // Replace with different doc
    await executeSetDocument(makeSetArgs({ document: SIMPLE_DOC }));
    expect(getDocState().document!.metadata.title).toBe("Simple");
    expect(findNodeById(getDocState().document!.root, "solo-btn")).toBeTruthy();
    // Old nodes gone
    expect(findNodeById(getDocState().document!.root, "card-1")).toBeNull();
  });
});
