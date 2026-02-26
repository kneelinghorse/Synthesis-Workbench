import { describe, expect, it } from "vitest";

import {
  buildFoundryFragmentRenderInput,
  composeDocumentFromFoundryFragments,
  mapFoundryValidationErrors,
  parseFoundryFragmentRenderOutput,
  type FoundryFragmentComponentIndex,
} from "./foundry-fragment-adapter";
import type { DesignDocument } from "@/types/document-model";

const FRAGMENT_DOC: DesignDocument = {
  metadata: { title: "Fragment doc", version: "2026.02" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "title-1",
        ref: "oods:Text",
        props: { text: "$data.content.title" },
      },
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 2, gap: 12 },
        children: [
          {
            nodeType: "component",
            id: "cta-1",
            ref: "oods:Button",
            props: { label: "Primary" },
          },
          {
            nodeType: "component",
            id: "cta-2",
            ref: "oods:Button",
            props: { label: "Secondary" },
          },
        ],
      },
    ],
  },
};

describe("foundry fragment adapter", () => {
  it("builds a single-screen fragment request with component children", () => {
    const built = buildFoundryFragmentRenderInput(FRAGMENT_DOC, {
      dataContext: {
        content: {
          title: "Resolved title",
        },
      },
    });

    expect(built.bindingErrors).toEqual([]);
    expect(built.renderInput).toMatchObject({
      mode: "full",
      output: {
        format: "fragments",
        strict: false,
        includeCss: true,
      },
      schema: {
        version: "2026.02",
        screens: [
          {
            id: "screen-root",
            component: "Stack",
            children: [
              { id: "title-1", component: "Text", props: { text: "Resolved title" } },
              { id: "cta-1", component: "Button", props: { label: "Primary" } },
              { id: "cta-2", component: "Button", props: { label: "Secondary" } },
            ],
          },
        ],
      },
    });
    expect(built.componentIndex.map((entry) => entry.id)).toEqual([
      "title-1",
      "cta-1",
      "cta-2",
    ]);
  });

  it("maps validation errors back to component IDs by child index", () => {
    const index: FoundryFragmentComponentIndex[] = [
      { id: "first", ref: "oods:Text", component: "Text", order: 0 },
      { id: "second", ref: "oods:Button", component: "Button", order: 1 },
    ];

    const mapped = mapFoundryValidationErrors(
      {
        valid: false,
        errors: [
          "UNKNOWN_COMPONENT: Unknown component 'Button' (/screens/0/children/1/component)",
        ],
        warnings: [],
        raw: null,
      },
      index,
    );

    expect(mapped).toEqual([
      {
        componentId: "second",
        componentRef: "oods:Button",
        message:
          "UNKNOWN_COMPONENT: Unknown component 'Button' (/screens/0/children/1/component)",
      },
    ]);
  });

  it("parses fragments and composes layout HTML with scoped CSS payload", () => {
    const rawPayload = {
      status: "ok",
      output: { format: "fragments", strict: false },
      fragments: {
        "title-1": {
          nodeId: "title-1",
          component: "Text",
          html: '<p data-oods-component="Text">Title</p>',
          cssRefs: ["css.base", "cmp.text.base"],
        },
        "cta-1": {
          nodeId: "cta-1",
          component: "Button",
          html: '<button data-oods-component="Button">Primary</button>',
          cssRefs: ["css.base", "cmp.button.base"],
        },
        "cta-2": {
          nodeId: "cta-2",
          component: "Button",
          html: '<button data-oods-component="Button">Secondary</button>',
          cssRefs: ["css.base", "cmp.button.base"],
        },
      },
      css: {
        "css.base": "[data-oods-component]{box-sizing:border-box;}",
        "cmp.text.base": "[data-oods-component=\"Text\"]{font-size:16px;}",
        "cmp.button.base": "[data-oods-component=\"Button\"]{border-radius:8px;}",
      },
      errors: [],
    };

    const built = buildFoundryFragmentRenderInput(FRAGMENT_DOC);
    const parsed = parseFoundryFragmentRenderOutput(rawPayload, built.componentIndex);
    const composed = composeDocumentFromFoundryFragments(FRAGMENT_DOC, parsed);

    expect(composed.errors).toEqual([]);
    expect(composed.html).toContain('data-layout="stack"');
    expect(composed.html).toContain('data-layout="grid"');
    expect(composed.html).toContain('data-component-id="title-1"');
    expect(composed.html).toContain('data-component-id="cta-1"');
    expect(composed.html).toContain('data-foundry-fragment-css="true"');
    expect(composed.html).toContain("[data-oods-component]");
  });
});
