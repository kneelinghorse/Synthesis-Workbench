import { describe, expect, it, vi } from "vitest";

import {
  getPreviewRenderer,
  PREVIEW_RENDERER_MODES,
  type PreviewRendererMode,
} from "./preview-renderer";
import type { FoundryMcpClient, FoundryRenderOutput } from "@/lib/mcp/foundry-client";
import type { DesignDocument } from "@/types/document-model";

const SIMPLE_COMPONENT_DOC: DesignDocument = {
  metadata: { title: "Simple document" },
  root: {
    nodeType: "component",
    id: "text-1",
    ref: "oods:Text",
    props: {
      text: "$data.content.title",
    },
  },
};

const MULTI_COMPONENT_DOC: DesignDocument = {
  metadata: { title: "Multi document" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 12 },
    children: [
      {
        nodeType: "component",
        id: "a",
        ref: "oods:Text",
        props: { text: "A" },
      },
      {
        nodeType: "component",
        id: "b",
        ref: "oods:Text",
        props: { text: "B" },
      },
    ],
  },
};

const UNKNOWN_COMPONENT_DOC: DesignDocument = {
  metadata: { title: "Unknown component" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 8 },
    children: [
      {
        nodeType: "component",
        id: "ok-1",
        ref: "oods:Text",
        props: { text: "Alpha" },
      },
      {
        nodeType: "component",
        id: "bad-1",
        ref: "oods:UnknownComponent",
        props: {},
      },
    ],
  },
};

const createClient = (
  renderImpl?: (schema: unknown) => Promise<FoundryRenderOutput>,
  overrides: Partial<FoundryMcpClient> = {},
): FoundryMcpClient => ({
  render:
    vi.fn(renderImpl ?? (async () => ({ html: "<div>Rendered</div>", warnings: [], raw: null }))),
  validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
  buildTokens: vi.fn(async () => ({ raw: null })),
  fetchStructuredData: vi.fn(),
  ...overrides,
});

describe("preview renderer abstraction", () => {
  it("uses full-document adapter by default and renders with one Foundry call", async () => {
    const client = createClient(async (schema) => ({
      html: "<div>Full document render</div>",
      warnings: [],
      raw: schema,
    }));

    const renderer = getPreviewRenderer();
    const result = await renderer.render(SIMPLE_COMPONENT_DOC, client, {
      dataContext: { content: { title: "Resolved from context" } },
    });

    expect(renderer.mode).toBe("full-document");
    expect(result.mode).toBe("full-document");
    expect(result.html).toContain("Full document render");
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const input = (client.render as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      mode?: string;
      schema?: {
        screens?: Array<{ component?: string; props?: Record<string, unknown> }>;
      };
    };
    expect(input.mode).toBe("full");
    expect(input.schema?.screens?.[0]).toEqual(
      expect.objectContaining({
        component: "Text",
        props: expect.objectContaining({ text: "Resolved from context" }),
      }),
    );
  });

  it("routes composition mode through the fragment adapter (deprecation alias)", async () => {
    const client = createClient(
      async () => ({
        html: '<div data-foundry-render="summary">Fragment summary</div>',
        warnings: [],
        raw: {
          status: "ok",
          output: { format: "fragments", strict: false },
          fragments: {
            a: {
              nodeId: "a",
              component: "Text",
              html: "<p>A</p>",
              cssRefs: ["css.base"],
            },
            b: {
              nodeId: "b",
              component: "Text",
              html: "<p>B</p>",
              cssRefs: ["css.base"],
            },
          },
          css: {
            "css.base": "[data-oods-component]{box-sizing:border-box;}",
          },
          errors: [],
        },
      }),
      {
        validate: vi.fn(async () => ({
          errors: [],
          warnings: [],
          valid: true,
          raw: null,
        })),
      },
    );

    const renderer = getPreviewRenderer("composition");
    const result = await renderer.render(MULTI_COMPONENT_DOC, client);

    expect(renderer.mode).toBe("composition");
    expect(result.mode).toBe("composition");
    expect(result.html).toContain('data-layout="stack"');
    expect((client.validate as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const renderInput = (client.render as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      output?: {
        format?: string;
      };
    };
    expect(renderInput.output?.format).toBe("fragments");
  });

  it("renders fragment mode through a single fragment request with local composition", async () => {
    const client = createClient(
      async (schema) => ({
        html: '<div data-foundry-render="summary">Fragment summary</div>',
        warnings: [],
        raw: {
          status: "ok",
          output: { format: "fragments", strict: false },
          fragments: {
            a: {
              nodeId: "a",
              component: "Text",
              html: '<p data-oods-component="Text">A</p>',
              cssRefs: ["css.base", "cmp.text.base"],
            },
            b: {
              nodeId: "b",
              component: "Text",
              html: '<p data-oods-component="Text">B</p>',
              cssRefs: ["css.base", "cmp.text.base"],
            },
          },
          css: {
            "css.base": "[data-oods-component]{box-sizing:border-box;}",
            "cmp.text.base": "[data-oods-component=\"Text\"]{color:#111827;}",
          },
          errors: [],
        },
      }),
      {
        validate: vi.fn(async () => ({
          errors: [],
          warnings: [],
          valid: true,
          raw: null,
        })),
      },
    );

    const renderer = getPreviewRenderer("fragments");
    const result = await renderer.render(MULTI_COMPONENT_DOC, client);

    expect(renderer.mode).toBe("fragments");
    expect(result.mode).toBe("fragments");
    expect(result.errors).toEqual([]);
    expect(result.foundryStatus).toBe("live");
    expect(result.html).toContain('data-layout="stack"');
    expect(result.html).toContain('data-component-id="a"');
    expect(result.html).toContain('data-component-id="b"');
    expect(result.html).toContain('data-foundry-fragment-css="true"');
    expect(result.html).toContain('data-oods-component="Text"');
    expect((client.validate as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const renderInput = (client.render as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      output?: {
        format?: string;
        strict?: boolean;
        includeCss?: boolean;
      };
      schema?: {
        screens?: Array<{ children?: unknown[] }>;
      };
    };
    expect(renderInput.output).toEqual({
      format: "fragments",
      strict: false,
      includeCss: true,
    });
    expect(renderInput.schema?.screens?.[0]?.children).toHaveLength(2);
  });

  it("falls back to full-document rendering when fragment pre-validation fails", async () => {
    const client = createClient(async () => ({
      html: "<div>Full document fallback</div>",
      warnings: [],
      raw: null,
    }), {
      validate: vi.fn(async () => ({
        valid: false,
        errors: [
          "UNKNOWN_COMPONENT: Unknown component 'UnknownComponent' (/screens/0/children/1/component)",
        ],
        warnings: [],
        raw: null,
      })),
    });

    const renderer = getPreviewRenderer("fragments");
    const result = await renderer.render(UNKNOWN_COMPONENT_DOC, client);

    expect(result.mode).toBe("fragments");
    expect(result.html).toContain("Full document fallback");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "bad-1",
          componentRef: "oods:UnknownComponent",
        }),
      ]),
    );

    expect((client.validate as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const fallbackRenderInput = (client.render as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      output?: unknown;
      schema?: unknown;
    };
    expect(fallbackRenderInput.output).toBeUndefined();
    expect(fallbackRenderInput.schema).toBeDefined();
  });

  it("propagates binding issues through the renderer result contract", async () => {
    const client = createClient();
    const renderer = getPreviewRenderer("full-document");

    const result = await renderer.render(SIMPLE_COMPONENT_DOC, client, {
      dataContext: {},
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.componentId).toBe("text-1");
    expect(result.errors[0]?.message).toContain("Missing data path");
  });

  it("supports explicit mode selection for all registered modes", () => {
    const modes = PREVIEW_RENDERER_MODES.slice() as PreviewRendererMode[];
    for (const mode of modes) {
      expect(getPreviewRenderer(mode).mode).toBe(mode);
    }
  });
});
