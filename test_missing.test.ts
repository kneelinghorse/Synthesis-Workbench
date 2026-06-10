import { describe, expect, it } from "vitest";
import {
  buildFoundryFragmentRenderInput,
  composeDocumentFromFoundryFragments,
  parseFoundryFragmentRenderOutput,
} from "./src/lib/engine/foundry-fragment-adapter";
import type { DesignDocument } from "./src/types/document-model";

const TEST_DOC: DesignDocument = {
  metadata: { title: "Test doc" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "comp-1",
        ref: "oods:Text",
        props: { text: "Comp 1" },
      },
      {
        nodeType: "component",
        id: "comp-2",
        ref: "oods:Button",
        props: { label: "Button 2" },
      },
    ],
  },
};

describe("missing fragment scenario", () => {
  it("provides clickable anchor for a component with missing fragment", () => {
    const rawPayload = {
      status: "ok",
      output: { format: "fragments", strict: false },
      fragments: {
        "comp-1": {
          nodeId: "comp-1",
          component: "Text",
          html: '<p data-oods-component="Text">Comp 1</p>',
          cssRefs: [],
        },
      },
      css: {},
      errors: [],
    };

    const built = buildFoundryFragmentRenderInput(TEST_DOC);
    const parsed = parseFoundryFragmentRenderOutput(rawPayload, built.componentIndex);
    const composed = composeDocumentFromFoundryFragments(TEST_DOC, parsed);

    // Should have error recorded
    expect(composed.errors.length).toBeGreaterThan(0);
    
    // The missing comp-2 should have a clickable anchor
    expect(composed.html).toContain('data-oods-node-id="comp-2"');
    expect(composed.html).toContain('data-component-error="true"');
  });
});
