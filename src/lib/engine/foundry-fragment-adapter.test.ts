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

const ENHANCER_DOC: DesignDocument = {
  metadata: { title: "Enhancer doc" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "kpi-card",
        ref: "oods:Card",
        props: {
          title: "Quarterly revenue",
          value: "$42k",
          trend: "+8%",
        },
      },
      {
        nodeType: "component",
        id: "headline",
        ref: "oods:Text",
        props: { text: "Already rendered text" },
      },
      {
        nodeType: "component",
        id: "unknown-fragment",
        ref: "oods:MysteryWidget",
        props: { label: "Custom widget", state: "active" },
      },
    ],
  },
};

const DASHBOARD_DOC: DesignDocument = {
  metadata: { title: "Dashboard Starter" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "dash-banner",
        ref: "oods:Banner",
        props: {
          title: "Workbench Overview",
          message: "Track pipeline health, adoption, and delivery metrics.",
          intent: "info",
        },
      },
      {
        nodeType: "component",
        id: "dash-tabs",
        ref: "oods:Tabs",
        props: {
          tabs: [
            { id: "overview", label: "Overview" },
            { id: "pipeline", label: "Pipeline" },
            { id: "team", label: "Team" },
          ],
          activeTab: "overview",
        },
      },
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 3, gap: 16 },
        children: [
          {
            nodeType: "component",
            id: "dash-kpi-users",
            ref: "oods:Card",
            props: { title: "Active users", value: "1,240", trend: "+12%" },
          },
          {
            nodeType: "component",
            id: "dash-kpi-revenue",
            ref: "oods:Card",
            props: { title: "Revenue", value: "$42k", trend: "+8%" },
          },
          {
            nodeType: "component",
            id: "dash-kpi-conversion",
            ref: "oods:Card",
            props: { title: "Conversion", value: "3.8%", trend: "+0.4%" },
          },
        ],
      },
      {
        nodeType: "component",
        id: "dash-table",
        ref: "oods:Table",
        props: {},
      },
      {
        nodeType: "component",
        id: "dash-action",
        ref: "oods:Button",
        props: { label: "View full report" },
      },
    ],
  },
};

const SLOT_LABEL_DOC: DesignDocument = {
  metadata: { title: "Slot label doc", version: "1.0" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "slot-save",
        ref: "oods:Button",
        props: { label: "Save" },
      },
      {
        nodeType: "component",
        id: "slot-card",
        ref: "oods:Card",
        props: { title: "Revenue", value: "$42k" },
      },
      {
        nodeType: "component",
        id: "slot-both",
        ref: "oods:Button",
        props: { label: "Confirm", title: "Submit the form" },
      },
      {
        nodeType: "component",
        id: "slot-bound",
        ref: "oods:Button",
        props: { label: "$data.cta.text" },
      },
      {
        nodeType: "component",
        id: "slot-none",
        ref: "oods:Text",
        props: { text: "No anchor name" },
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

  it("forwards a stable slot label (raw label/title) as child meta.label", () => {
    // meta.label drives Forge's data-oods-label slot anchor (verified live:
    // child meta.label -> data-oods-label on the rendered element). The comment
    // layer (s20-m03) pins slot-kind anchors to it, so the anchor must be the
    // RAW prop, not the binding-resolved value: slot-bound keeps its
    // "$data.cta.text" anchor even though the visible prop resolves to "Buy
    // now". label wins over title; absent => no meta so Forge omits the anchor.
    const built = buildFoundryFragmentRenderInput(SLOT_LABEL_DOC, {
      dataContext: { cta: { text: "Buy now" } },
    });

    expect(built.renderInput.schema.screens[0].children).toEqual([
      {
        id: "slot-save",
        component: "Button",
        props: { label: "Save" },
        meta: { label: "Save" },
      },
      {
        id: "slot-card",
        component: "Card",
        props: { title: "Revenue", value: "$42k" },
        meta: { label: "Revenue" },
      },
      {
        id: "slot-both",
        component: "Button",
        props: { label: "Confirm", title: "Submit the form" },
        meta: { label: "Confirm" },
      },
      {
        id: "slot-bound",
        component: "Button",
        props: { label: "Buy now" },
        meta: { label: "$data.cta.text" },
      },
      {
        id: "slot-none",
        component: "Text",
        props: { text: "No anchor name" },
      },
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

  it("enhances empty fragment shells while preserving full fragments", () => {
    const rawPayload = {
      status: "ok",
      output: { format: "fragments", strict: false },
      fragments: {
        "kpi-card": {
          nodeId: "kpi-card",
          component: "Card",
          html: '<article data-oods-component="Card"></article>',
          cssRefs: ["css.base", "cmp.card.base"],
        },
        headline: {
          nodeId: "headline",
          component: "Text",
          html: '<p data-oods-component="Text">Already rendered text</p>',
          cssRefs: ["css.base", "cmp.text.base"],
        },
        "unknown-fragment": {
          nodeId: "unknown-fragment",
          component: "MysteryWidget",
          html: '<section data-oods-component="MysteryWidget"></section>',
          cssRefs: ["css.base"],
        },
      },
      css: {
        "css.base": "[data-oods-component]{box-sizing:border-box;}",
        "cmp.card.base": "[data-oods-component=\"Card\"]{padding:12px;}",
        "cmp.text.base": "[data-oods-component=\"Text\"]{font-size:16px;}",
      },
      errors: [],
    };

    const built = buildFoundryFragmentRenderInput(ENHANCER_DOC);
    const parsed = parseFoundryFragmentRenderOutput(rawPayload, built.componentIndex);
    const composed = composeDocumentFromFoundryFragments(ENHANCER_DOC, parsed);

    expect(composed.errors).toEqual([]);
    expect(composed.html).toContain('data-enhancer="Card"');
    expect(composed.html).toContain("Quarterly revenue");
    expect(composed.html).toContain("$42k");
    expect(composed.html).toContain("+8%");
    expect(composed.html).toContain("Already rendered text");
    expect(composed.html).toContain('data-enhancer="Generic"');
    expect(composed.html).toContain("Custom widget");
  });

  it("renders dashboard-starter cards with visible content when Foundry returns empty card shells", () => {
    const rawPayload = {
      status: "ok",
      output: { format: "fragments", strict: false },
      fragments: {
        "dash-banner": {
          nodeId: "dash-banner",
          component: "Banner",
          html: '<section data-oods-component="Banner" data-prop-intent="info">Track pipeline health, adoption, and delivery metrics.</section>',
          cssRefs: ["css.base", "cmp.banner.base"],
        },
        "dash-tabs": {
          nodeId: "dash-tabs",
          component: "Tabs",
          html: '<section data-oods-component="Tabs"><div role="tablist"><button>Overview</button><button>Pipeline</button><button>Team</button></div></section>',
          cssRefs: ["css.base", "cmp.tabs.base"],
        },
        "dash-kpi-users": {
          nodeId: "dash-kpi-users",
          component: "Card",
          html: '<article data-oods-component="Card" data-prop-value="1,240" data-prop-trend="+12%"></article>',
          cssRefs: ["css.base", "cmp.card.base"],
        },
        "dash-kpi-revenue": {
          nodeId: "dash-kpi-revenue",
          component: "Card",
          html: '<article data-oods-component="Card" data-prop-value="$42k" data-prop-trend="+8%"></article>',
          cssRefs: ["css.base", "cmp.card.base"],
        },
        "dash-kpi-conversion": {
          nodeId: "dash-kpi-conversion",
          component: "Card",
          html: '<article data-oods-component="Card" data-prop-value="3.8%" data-prop-trend="+0.4%"></article>',
          cssRefs: ["css.base", "cmp.card.base"],
        },
        "dash-table": {
          nodeId: "dash-table",
          component: "Table",
          html: '<table data-oods-component="Table"><thead><tr><th>Metric</th><th>Value</th><th>Delta</th></tr></thead><tbody><tr><td>Sessions</td><td>18,240</td><td>+4.2%</td></tr><tr><td>Template applies</td><td>1,032</td><td>+9.8%</td></tr><tr><td>A11y pass rate</td><td>97.4%</td><td>+1.1%</td></tr></tbody></table>',
          cssRefs: ["css.base", "cmp.table.base"],
        },
        "dash-action": {
          nodeId: "dash-action",
          component: "Button",
          html: '<button data-oods-component="Button">View full report</button>',
          cssRefs: ["css.base", "cmp.button.base"],
        },
      },
      css: {
        "css.base": "[data-oods-component]{box-sizing:border-box;}",
        "cmp.banner.base": "[data-oods-component=\"Banner\"]{display:block;}",
        "cmp.tabs.base": "[data-oods-component=\"Tabs\"]{display:block;}",
        "cmp.card.base": "[data-oods-component=\"Card\"]{display:block;}",
        "cmp.table.base": "[data-oods-component=\"Table\"]{display:block;}",
        "cmp.button.base": "[data-oods-component=\"Button\"]{display:inline-flex;}",
      },
      errors: [],
    };

    const built = buildFoundryFragmentRenderInput(DASHBOARD_DOC);
    const parsed = parseFoundryFragmentRenderOutput(rawPayload, built.componentIndex);
    const composed = composeDocumentFromFoundryFragments(DASHBOARD_DOC, parsed);

    expect(composed.errors).toEqual([]);
    expect((composed.html.match(/data-enhancer="Card"/g) ?? []).length).toBe(3);
    expect(composed.html).toContain("Workbench Overview");
    expect(composed.html).toContain("Active users");
    expect(composed.html).toContain("1,240");
    expect(composed.html).toContain("+12%");
    expect(composed.html).toContain("Revenue");
    expect(composed.html).toContain("$42k");
    expect(composed.html).toContain("+8%");
    expect(composed.html).toContain("Conversion");
    expect(composed.html).toContain("3.8%");
    expect(composed.html).toContain("+0.4%");
    expect(composed.html).toContain("Track pipeline health, adoption, and delivery metrics.");
    expect(composed.html).toContain("Overview");
    expect(composed.html).toContain("Pipeline");
    expect(composed.html).toContain("Team");
    expect(composed.html).toContain("View full report");
    expect(composed.html).not.toMatch(
      /<article[^>]*data-oods-component="Card"[^>]*><\/article>/,
    );
  });
});
