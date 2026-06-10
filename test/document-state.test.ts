/**
 * Document State Store Tests
 *
 * Tests the Zustand store that manages the active DesignDocument
 * and composition rendering state.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStateStore } from "../src/lib/stores/document-state";
import type { DesignDocument } from "../src/types/document-model";
import { isLayoutNode } from "../src/types/document-model";
import type { CompositionError } from "../src/lib/engine/composition-renderer";

// ============================================================================
// Fixtures
// ============================================================================

const SAMPLE_DOC: DesignDocument = {
  metadata: { title: "Test Doc" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "btn-1",
        ref: "oods:Button",
        props: { text: "Click" },
      },
    ],
  },
};

const ANOTHER_DOC: DesignDocument = {
  metadata: { title: "Another Doc" },
  root: {
    nodeType: "component",
    id: "card-1",
    ref: "oods:Card",
    props: {},
  },
};

const SAMPLE_ERRORS: CompositionError[] = [
  {
    componentId: "btn-1",
    componentRef: "oods:Button",
    message: "Render failed",
  },
];

// ============================================================================
// Helpers
// ============================================================================

const getState = () => useDocumentStateStore.getState();

// ============================================================================
// Tests
// ============================================================================

describe("document-state store", () => {
  beforeEach(() => {
    getState().reset();
  });

  describe("initial state", () => {
    it("should start with null document", () => {
      expect(getState().document).toBeNull();
    });

    it("should start with idle status", () => {
      expect(getState().compositionStatus).toBe("idle");
    });

    it("should start with empty errors", () => {
      expect(getState().compositionErrors).toEqual([]);
    });

    it("should start with revision 0", () => {
      expect(getState().revision).toBe(0);
    });

    it("should start with retry nonce 0", () => {
      expect(getState().retryNonce).toBe(0);
    });
  });

  describe("setDocument", () => {
    it("should set the document", () => {
      getState().setDocument(SAMPLE_DOC);

      expect(getState().document).toEqual(SAMPLE_DOC);
    });

    it("should increment revision on each document set", () => {
      getState().setDocument(SAMPLE_DOC);
      expect(getState().revision).toBe(1);

      getState().setDocument(ANOTHER_DOC);
      expect(getState().revision).toBe(2);
    });

    it("should increment revision even when setting same document", () => {
      getState().setDocument(SAMPLE_DOC);
      getState().setDocument(SAMPLE_DOC);

      expect(getState().revision).toBe(2);
    });

    it("should clear composition errors when document changes", () => {
      getState().setCompositionState("error", SAMPLE_ERRORS);
      expect(getState().compositionErrors).toHaveLength(1);

      getState().setDocument(ANOTHER_DOC);
      expect(getState().compositionErrors).toEqual([]);
    });

    it("should reset composition status to idle on document change", () => {
      getState().setCompositionState("rendering");

      getState().setDocument(SAMPLE_DOC);
      expect(getState().compositionStatus).toBe("idle");
    });

    it("should handle setting null document", () => {
      getState().setDocument(SAMPLE_DOC);
      getState().setDocument(null);

      expect(getState().document).toBeNull();
      expect(getState().revision).toBe(2);
    });
  });

  describe("setCompositionState", () => {
    it("should set rendering status", () => {
      getState().setCompositionState("rendering");

      expect(getState().compositionStatus).toBe("rendering");
      expect(getState().compositionErrors).toEqual([]);
    });

    it("should set success status", () => {
      getState().setCompositionState("success");

      expect(getState().compositionStatus).toBe("success");
    });

    it("should set error status with errors", () => {
      getState().setCompositionState("error", SAMPLE_ERRORS);

      expect(getState().compositionStatus).toBe("error");
      expect(getState().compositionErrors).toEqual(SAMPLE_ERRORS);
    });

    it("should clear errors when status changes without errors", () => {
      getState().setCompositionState("error", SAMPLE_ERRORS);
      getState().setCompositionState("rendering");

      expect(getState().compositionErrors).toEqual([]);
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      getState().setDocument(SAMPLE_DOC);
      getState().setCompositionState("error", SAMPLE_ERRORS);

      getState().reset();

      expect(getState().document).toBeNull();
      expect(getState().compositionStatus).toBe("idle");
      expect(getState().compositionErrors).toEqual([]);
      expect(getState().revision).toBe(0);
      expect(getState().retryNonce).toBe(0);
    });
  });

  describe("requestRetry", () => {
    it("increments retry nonce and resets status to idle", () => {
      getState().setCompositionState("error", SAMPLE_ERRORS);
      getState().requestRetry();

      expect(getState().retryNonce).toBe(1);
      expect(getState().compositionStatus).toBe("idle");
    });
  });

  describe("skipComponent", () => {
    it("removes a failed component from the document and increments revision", () => {
      getState().setDocument(SAMPLE_DOC);
      getState().setCompositionState("error", SAMPLE_ERRORS);

      getState().skipComponent("btn-1");

      expect(getState().revision).toBe(2);
      expect(getState().compositionStatus).toBe("idle");
      expect(getState().compositionErrors).toEqual([]);
      const root = getState().document?.root;
      expect(root && isLayoutNode(root) && root.children).toEqual([]);
    });

    it("is a no-op when no document is loaded", () => {
      getState().skipComponent("missing");
      expect(getState().document).toBeNull();
      expect(getState().revision).toBe(0);
    });
  });
});
