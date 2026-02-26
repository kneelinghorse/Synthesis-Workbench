import { describe, expect, it } from "vitest";

import type { DesignDocument } from "@/types/document-model";
import { BUILT_IN_TEMPLATE_SLUGS, applyBuiltInTemplate } from "@/lib/templates/built-in-library";
import { renderStaticDocument } from "./static-renderer";

describe("renderStaticDocument", () => {
  it("renders dedicated fallback markup for all supported S44 components", () => {
    const document: DesignDocument = {
      metadata: { title: "S44 Coverage" },
      root: {
        nodeType: "layout",
        layout: { type: "stack", gap: 10 },
        children: [
          {
            nodeType: "component",
            id: "button-1",
            ref: "oods:Button",
            props: { label: "Save", variant: "primary" },
          },
          {
            nodeType: "component",
            id: "card-1",
            ref: "oods:Card",
            props: { title: "Revenue", body: "$42k" },
          },
          {
            nodeType: "component",
            id: "text-1",
            ref: "oods:Text",
            props: { text: "Fallback text" },
          },
          {
            nodeType: "component",
            id: "input-1",
            ref: "oods:Input",
            props: { label: "Email", placeholder: "you@example.com" },
          },
          {
            nodeType: "component",
            id: "select-1",
            ref: "oods:Select",
            props: {
              label: "Role",
              options: [
                { value: "editor", label: "Editor" },
                { value: "admin", label: "Admin" },
              ],
              value: "editor",
            },
          },
          {
            nodeType: "component",
            id: "badge-1",
            ref: "oods:Badge",
            props: { label: "Needs Review", tone: "warning" },
          },
          {
            nodeType: "component",
            id: "banner-1",
            ref: "oods:Banner",
            props: { title: "Warning", message: "Check configuration", intent: "warning" },
          },
          {
            nodeType: "component",
            id: "table-1",
            ref: "oods:Table",
            props: {
              columns: [
                { key: "metric", label: "Metric" },
                { key: "value", label: "Value" },
              ],
              rows: [{ metric: "Sessions", value: "18,240" }],
            },
          },
          {
            nodeType: "component",
            id: "tabs-1",
            ref: "oods:Tabs",
            props: {
              tabs: [
                { id: "overview", label: "Overview" },
                { id: "activity", label: "Activity" },
              ],
              activeTab: "overview",
            },
          },
          {
            nodeType: "component",
            id: "stack-1",
            ref: "oods:Stack",
            props: {
              direction: "horizontal",
              items: ["First", "Second", "Third"],
            },
          },
        ],
      },
    };

    const html = renderStaticDocument(document);

    expect(html).toContain('data-static-component="button"');
    expect(html).toContain('data-static-component="card"');
    expect(html).toContain('data-static-component="text"');
    expect(html).toContain('data-static-component="input"');
    expect(html).toContain('data-static-component="select"');
    expect(html).toContain('data-static-component="badge"');
    expect(html).toContain('data-static-component="banner"');
    expect(html).toContain('data-static-component="table"');
    expect(html).toContain('data-static-component="tabs"');
    expect(html).toContain('data-static-component="stack"');
  });

  it("renders button variants for primary and secondary", () => {
    const document: DesignDocument = {
      metadata: { title: "Button Variants" },
      root: {
        nodeType: "layout",
        layout: { type: "stack", gap: 8 },
        children: [
          {
            nodeType: "component",
            id: "button-primary",
            ref: "oods:Button",
            props: { label: "Primary", variant: "primary" },
          },
          {
            nodeType: "component",
            id: "button-secondary",
            ref: "oods:Button",
            props: { label: "Secondary", variant: "secondary" },
          },
        ],
      },
    };

    const html = renderStaticDocument(document);

    expect(html).toContain('data-static-variant="primary"');
    expect(html).toContain('data-static-variant="secondary"');
    expect(html).toContain("Primary");
    expect(html).toContain("Secondary");
  });

  it("renders table headers and row data from props", () => {
    const document: DesignDocument = {
      metadata: { title: "Table Data" },
      root: {
        nodeType: "component",
        id: "table-1",
        ref: "oods:Table",
        props: {
          columns: [
            { key: "metric", label: "Metric" },
            { key: "value", label: "Value" },
            { key: "delta", label: "Delta" },
          ],
          rows: [
            { metric: "Sessions", value: "18,240", delta: "+4.2%" },
            { metric: "Conversion", value: "3.8%", delta: "+0.4%" },
          ],
        },
      },
    };

    const html = renderStaticDocument(document);

    expect(html).toContain("Metric");
    expect(html).toContain("Value");
    expect(html).toContain("Delta");
    expect(html).toContain("Sessions");
    expect(html).toContain("18,240");
    expect(html).toContain("+4.2%");
    expect(html).toContain("Conversion");
    expect(html).toContain("3.8%");
  });

  it("renders input with label and placeholder", () => {
    const document: DesignDocument = {
      metadata: { title: "Input Field" },
      root: {
        nodeType: "component",
        id: "input-1",
        ref: "oods:Input",
        props: {
          label: "Full name",
          placeholder: "Jane Doe",
          required: true,
        },
      },
    };

    const html = renderStaticDocument(document);

    expect(html).toContain("Full name *");
    expect(html).toContain('placeholder="Jane Doe"');
    expect(html).toContain('data-static-component="input"');
  });

  it("renders tabs with active tab highlighted", () => {
    const document: DesignDocument = {
      metadata: { title: "Tabs" },
      root: {
        nodeType: "component",
        id: "tabs-1",
        ref: "oods:Tabs",
        props: {
          tabs: [
            { id: "overview", label: "Overview" },
            { id: "pipeline", label: "Pipeline" },
          ],
          activeTab: "pipeline",
        },
      },
    };

    const html = renderStaticDocument(document);

    expect(html).toContain('data-tab-id="overview" data-active="false"');
    expect(html).toContain('data-tab-id="pipeline" data-active="true"');
  });

  it("renders badge and banner with intent-aware markers", () => {
    const document: DesignDocument = {
      metadata: { title: "Status Components" },
      root: {
        nodeType: "layout",
        layout: { type: "stack", gap: 8 },
        children: [
          {
            nodeType: "component",
            id: "badge-1",
            ref: "oods:Badge",
            props: { label: "Active", tone: "success" },
          },
          {
            nodeType: "component",
            id: "banner-1",
            ref: "oods:Banner",
            props: {
              title: "Deployment warning",
              message: "One check is pending",
              intent: "warning",
            },
          },
        ],
      },
    };

    const html = renderStaticDocument(document);

    expect(html).toContain('data-static-tone="success"');
    expect(html).toContain('data-static-intent="warning"');
    expect(html).toContain("Deployment warning");
    expect(html).toContain("One check is pending");
  });

  it("renders cards with distinct title and body regions", () => {
    const document: DesignDocument = {
      metadata: { title: "Card" },
      root: {
        nodeType: "component",
        id: "card-1",
        ref: "oods:Card",
        props: {
          title: "Unified workflow",
          body: "From Stage1 ingest to Foundry output with no context switching.",
        },
      },
    };

    const html = renderStaticDocument(document);

    expect(html).toContain('data-static-card-title="true"');
    expect(html).toContain('data-static-card-body="true"');
    expect(html).toContain("Unified workflow");
    expect(html).toContain("From Stage1 ingest to Foundry output with no context switching.");
  });

  it("resolves $data bindings and preserves unresolved expressions", () => {
    const document: DesignDocument = {
      metadata: { title: "Binding Test" },
      root: {
        nodeType: "layout",
        layout: { type: "stack", gap: 8 },
        children: [
          {
            nodeType: "component",
            id: "card-bound",
            ref: "oods:Card",
            props: { title: "$data.kpi.label", body: "$data.kpi.value" },
          },
          {
            nodeType: "component",
            id: "text-unresolved",
            ref: "oods:Text",
            props: { text: "$data.missing.path" },
          },
        ],
      },
    };

    const html = renderStaticDocument(document, {
      dataContext: { kpi: { label: "Revenue", value: "$42k" } },
    });

    expect(html).toContain("Revenue");
    expect(html).toContain("$42k");
    expect(html).toContain("$data.missing.path");
  });

  it("renders all built-in templates as recognizable offline layouts", () => {
    for (const slug of BUILT_IN_TEMPLATE_SLUGS) {
      const templateDocument = applyBuiltInTemplate(slug);
      const html = renderStaticDocument(templateDocument);

      expect(html).toContain('data-static-preview="true"');
      expect(html).toContain(`>${templateDocument.metadata.title}</div>`);
      expect(html).not.toContain('data-static-component="unknown"');
      expect(html).toMatch(/data-static-component="(banner|tabs|card|table|button|text|input|select|badge)"/);
    }
  });
});
