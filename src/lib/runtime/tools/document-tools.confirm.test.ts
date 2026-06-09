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
  patchNodeCommentLink,
  rejectPatchNode,
  rejectSetDocument,
  setDocumentCommentLink,
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

// The Tool UI resolves the pinned comments a change addresses ONLY when the
// human Accepts AND the change actually applied (mission s20-m10). These guard
// that gate: a reject or a failed apply must return null so a discarded/no-op
// proposal never silently closes a comment (which would drop the human's
// critique without addressing it).
describe("comment resolution linkage gating", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    setDoc(baseDoc());
  });

  it("patchNodeCommentLink links declared ids + the patch nodeId on a successful Accept", () => {
    const args = {
      requestId: "r",
      nodeId: "btn-1",
      props: { label: "Submit" },
      addressesCommentIds: ["c-1"],
    };
    const link = patchNodeCommentLink(args, confirmPatchNode(args));

    expect(link).toEqual({ commentIds: ["c-1"], nodeId: "btn-1" });
  });

  it("patchNodeCommentLink is null on reject — a discarded patch must not resolve comments", () => {
    const args = { requestId: "r", nodeId: "btn-1", addressesCommentIds: ["c-1"] };
    expect(patchNodeCommentLink(args, rejectPatchNode(args))).toBeNull();
  });

  it("patchNodeCommentLink is null when the patch failed (node not found)", () => {
    const args = { requestId: "r", nodeId: "ghost", addressesCommentIds: ["c-1"] };
    const result = confirmPatchNode(args); // ghost isn't in the document
    expect(result.patched).toBe(false);
    expect(patchNodeCommentLink(args, result)).toBeNull();
  });

  it("setDocumentCommentLink links the declared ids on a successful Accept (no nodeId)", async () => {
    const args = {
      requestId: "r",
      document: baseDoc(),
      addressesCommentIds: ["c-2", "c-3"],
    };
    const link = setDocumentCommentLink(args, await confirmSetDocument(args));

    expect(link).toEqual({ commentIds: ["c-2", "c-3"] });
  });

  it("setDocumentCommentLink is null on reject — a discarded rewrite must not resolve comments", () => {
    const args = { requestId: "r", document: baseDoc(), addressesCommentIds: ["c-2"] };
    expect(setDocumentCommentLink(args, rejectSetDocument())).toBeNull();
  });
});
