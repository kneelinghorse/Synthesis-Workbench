/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { useDocumentStateStore } from "@/lib/stores/document-state";
import type { DesignDocument } from "@/types/document-model";
import { GraphCanvas } from "./GraphCanvas";

// React Flow measures node/pane sizes via ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  useDocumentStateStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const doc: DesignDocument = {
  metadata: { title: "t" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 8 },
    children: [
      { nodeType: "component", id: "hero", ref: "oods:Hero", props: {} },
      { nodeType: "component", id: "btn-1", ref: "oods:Button", props: {} },
    ],
  },
};

describe("GraphCanvas", () => {
  it("shows the empty state when there is no active document", () => {
    render(<GraphCanvas />);
    expect(screen.getByText(/no active document to map/i)).toBeTruthy();
  });

  it("renders a node per component in the active document's IA", async () => {
    useDocumentStateStore.getState().setDocument(doc);
    render(<GraphCanvas />);

    // The custom IA nodes render their labels (oods: prefix stripped).
    await waitFor(() => {
      expect(screen.getByText("Hero")).toBeTruthy();
      expect(screen.getByText("Button")).toBeTruthy();
    });

    // The component node carries the instance anchor (= data-oods-node-id) the
    // comment overlay pins to — the same anchor the HTML preview uses.
    expect(document.querySelector('[data-oods-node-id="btn-1"]')).toBeTruthy();
    expect(document.querySelector('[data-oods-node-id="hero"]')).toBeTruthy();
  });
});
