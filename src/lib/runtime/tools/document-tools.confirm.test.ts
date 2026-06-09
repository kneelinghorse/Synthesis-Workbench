import { beforeEach, describe, expect, it } from "vitest";

import { useDocumentStateStore } from "@/lib/stores/document-state";
import type {
  ComponentNode,
  DesignDocument,
  LayoutNode,
} from "@/types/document-model";

import {
  confirmPatchNode,
  confirmSetDocument,
  rejectPatchNode,
  rejectSetDocument,
} from "./document-tools";

const baseDoc = (): DesignDocument => ({
  metadata: { title: "t" },
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
});

const setDoc = (doc: DesignDocument) =>
  useDocumentStateStore.getState().setDocument(doc);
const getDoc = () => useDocumentStateStore.getState().document;
const button = (): ComponentNode =>
  (getDoc()!.root as LayoutNode).children[0] as ComponentNode;

describe("suggest-and-confirm document tools", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    setDoc(baseDoc());
  });

  it("confirmPatchNode applies the patch and tags the decision as applied", () => {
    const result = confirmPatchNode({
      requestId: "r",
      nodeId: "btn-1",
      props: { label: "Submit" },
    });

    expect(result.decision).toBe("applied");
    expect(result.patched).toBe(true);
    expect(button().props.label).toBe("Submit");
  });

  it("rejectPatchNode leaves the store untouched (the whole point of confirm)", () => {
    const before = getDoc();

    const result = rejectPatchNode({
      requestId: "r",
      nodeId: "btn-1",
      props: { label: "Submit" },
    });

    expect(result.decision).toBe("rejected");
    expect(result.patched).toBe(false);
    // Identity unchanged — reject must not call setDocument.
    expect(getDoc()).toBe(before);
    expect(button().props.label).toBe("Save");
  });

  it("confirmSetDocument replaces the document and tags decision applied", async () => {
    const next = baseDoc();
    next.metadata.title = "replaced";

    const result = await confirmSetDocument({ requestId: "r", document: next });

    expect(result.decision).toBe("applied");
    expect(getDoc()?.metadata.title).toBe("replaced");
  });

  it("rejectSetDocument leaves the document untouched", () => {
    const before = getDoc();

    const result = rejectSetDocument();

    expect(result.decision).toBe("rejected");
    expect(result.saved).toBe(false);
    expect(getDoc()).toBe(before);
  });
});
