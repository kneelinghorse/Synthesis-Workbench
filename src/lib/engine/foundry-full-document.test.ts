import { describe, expect, it } from "vitest";

import {
  buildFoundryFullDocumentRenderInput,
  isFoundryUnavailableError,
} from "./foundry-full-document";
import type { DesignDocument } from "@/types/document-model";

describe("buildFoundryFullDocumentRenderInput", () => {
  it("builds a full-document Foundry payload with resolved data bindings", () => {
    const doc: DesignDocument = {
      metadata: {
        title: "Bound document",
        version: "2026.02",
      },
      root: {
        nodeType: "component",
        id: "title-1",
        ref: "oods:Text",
        props: {
          text: "$data.content.title",
        },
      },
    };

    const result = buildFoundryFullDocumentRenderInput(doc, {
      dataContext: {
        content: {
          title: "Resolved title",
        },
      },
    });

    expect(result.bindingErrors).toEqual([]);
    expect(result.input).toEqual({
      mode: "full",
      schema: {
        version: "2026.02",
        screens: [
          {
            id: "title-1",
            component: "Text",
            props: {
              text: "Resolved title",
            },
            meta: {
              label: "Bound document",
            },
          },
        ],
      },
    });
  });

  it("converts layout nodes into Foundry screen/layout elements with stable synthetic IDs", () => {
    const doc: DesignDocument = {
      metadata: {
        title: "Dashboard",
      },
      root: {
        nodeType: "layout",
        layout: {
          type: "stack",
          gap: 16,
        },
        children: [
          {
            nodeType: "component",
            id: "hero",
            ref: "oods:Text",
            props: { text: "Welcome" },
          },
          {
            nodeType: "layout",
            layout: {
              type: "grid",
              columns: 2,
              gap: 12,
            },
            children: [
              {
                nodeType: "component",
                id: "kpi-1",
                ref: "oods:Card",
                props: { title: "KPI 1" },
              },
              {
                nodeType: "component",
                id: "kpi-2",
                ref: "oods:Card",
                props: { title: "KPI 2" },
              },
            ],
          },
        ],
      },
    };

    const result = buildFoundryFullDocumentRenderInput(doc);

    expect(result.bindingErrors).toEqual([]);
    expect(result.input.schema.screens[0]).toEqual(
      expect.objectContaining({
        id: "screen-root",
        component: "Stack",
        layout: { type: "stack", align: undefined },
        props: { gap: 16 },
        children: expect.arrayContaining([
          expect.objectContaining({
            id: "hero",
            component: "Text",
          }),
          expect.objectContaining({
            id: "layout-1",
            component: "Stack",
            layout: { type: "grid", align: undefined },
            props: { layoutType: "grid", columns: 2, gap: 12 },
          }),
        ]),
      }),
    );
  });

  it("records binding resolution issues without dropping the render payload", () => {
    const doc: DesignDocument = {
      metadata: { title: "Missing data path" },
      root: {
        nodeType: "component",
        id: "card-1",
        ref: "oods:Card",
        props: {
          title: "$data.account.name",
        },
      },
    };

    const result = buildFoundryFullDocumentRenderInput(doc, {
      dataContext: {},
    });

    expect(result.bindingErrors).toHaveLength(1);
    expect(result.bindingErrors[0]?.componentId).toBe("card-1");
    expect(result.bindingErrors[0]?.componentRef).toBe("oods:Card");
    expect(result.bindingErrors[0]?.message).toContain("Missing data path");
    expect(result.input.schema.screens[0]?.props?.title).toBe("$data.account.name");
  });

  it("defaults to the standard DSL version when document metadata omits version", () => {
    const doc: DesignDocument = {
      metadata: { title: "No version provided" },
      root: {
        nodeType: "component",
        id: "single",
        ref: "oods:Text",
        props: { text: "Hello" },
      },
    };

    const result = buildFoundryFullDocumentRenderInput(doc);
    expect(result.input.schema.version).toBe("2025.11");
  });
});

describe("isFoundryUnavailableError", () => {
  it("returns true for connectivity and timeout failures", () => {
    expect(isFoundryUnavailableError({ code: "CONNECTION_FAILED" })).toBe(true);
    expect(isFoundryUnavailableError({ code: "NETWORK_ERROR" })).toBe(true);
    expect(isFoundryUnavailableError({ code: "TIMEOUT" })).toBe(true);
    expect(isFoundryUnavailableError({ code: "MISSING_BASE_URL" })).toBe(true);
  });

  it("returns false for non-availability errors", () => {
    expect(isFoundryUnavailableError({ code: "TOOL_ERROR" })).toBe(false);
    expect(isFoundryUnavailableError(new Error("plain error"))).toBe(false);
    expect(isFoundryUnavailableError(null)).toBe(false);
  });
});
