import { describe, expect, it, vi } from "vitest";

import {
  getPreviewRenderer,
  isFoundryUnavailableError,
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

const makeFragmentResponse = (
  fragments: Record<string, { nodeId: string; component: string; html: string; cssRefs: string[] }>,
  css: Record<string, string> = { "css.base": "[data-oods-component]{box-sizing:border-box;}" },
): FoundryRenderOutput => ({
  html: '<div data-foundry-render="summary">Fragment summary</div>',
  warnings: [],
  raw: {
    status: "ok",
    output: { format: "fragments", strict: false },
    fragments,
    css,
    errors: [],
  },
});

const createClient = (
  renderImpl?: (schema: unknown) => Promise<FoundryRenderOutput>,
  overrides: Partial<FoundryMcpClient> = {},
): FoundryMcpClient => ({
  render:
    vi.fn(renderImpl ?? (async () => makeFragmentResponse({}))),
  validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
  buildTokens: vi.fn(async () => ({ raw: null })),
  fetchStructuredData: vi.fn(),
  ...overrides,
});

describe("preview renderer abstraction", () => {
  it("defaults to fragment adapter and renders via validate + render pipeline", async () => {
    const client = createClient(
      async () => makeFragmentResponse({
        a: { nodeId: "a", component: "Text", html: '<p data-oods-component="Text">A</p>', cssRefs: ["css.base"] },
        b: { nodeId: "b", component: "Text", html: '<p data-oods-component="Text">B</p>', cssRefs: ["css.base"] },
      }),
    );

    const renderer = getPreviewRenderer();
    const result = await renderer.render(MULTI_COMPONENT_DOC, client);

    expect(renderer.mode).toBe("fragments");
    expect(result.mode).toBe("fragments");
    expect(result.foundryStatus).toBe("live");
    expect(result.html).toContain('data-component-id="a"');
    expect(result.html).toContain('data-component-id="b"');
    expect((client.validate as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const renderInput = (client.render as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      output?: { format?: string };
    };
    expect(renderInput.output?.format).toBe("fragments");
  });

  it("routes composition mode through the fragment adapter (deprecation alias)", async () => {
    const client = createClient(
      async () => makeFragmentResponse({
        a: { nodeId: "a", component: "Text", html: "<p>A</p>", cssRefs: ["css.base"] },
        b: { nodeId: "b", component: "Text", html: "<p>B</p>", cssRefs: ["css.base"] },
      }),
    );

    const renderer = getPreviewRenderer("composition");
    const result = await renderer.render(MULTI_COMPONENT_DOC, client);

    expect(renderer.mode).toBe("composition");
    expect(result.mode).toBe("composition");
    expect(result.html).toContain('data-layout="stack"');
    expect((client.validate as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const renderInput = (client.render as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      output?: { format?: string };
    };
    expect(renderInput.output?.format).toBe("fragments");
  });

  it("renders fragment mode through a single fragment request with local composition", async () => {
    const client = createClient(
      async () => makeFragmentResponse(
        {
          a: { nodeId: "a", component: "Text", html: '<p data-oods-component="Text">A</p>', cssRefs: ["css.base", "cmp.text.base"] },
          b: { nodeId: "b", component: "Text", html: '<p data-oods-component="Text">B</p>', cssRefs: ["css.base", "cmp.text.base"] },
        },
        {
          "css.base": "[data-oods-component]{box-sizing:border-box;}",
          "cmp.text.base": '[data-oods-component="Text"]{color:#111827;}',
        },
      ),
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

  it("returns an unavailable preview when fragment pre-validation fails", async () => {
    const client = createClient(undefined, {
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
    expect(result.foundryStatus).toBe("dry-run");
    // No divergent local render — html is empty; errors are still surfaced.
    expect(result.html).toBe("");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "bad-1",
          componentRef: "oods:UnknownComponent",
        }),
      ]),
    );

    // Validate was called but render was NOT (validation failed → static fallback)
    expect((client.validate as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((client.render as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("returns an unavailable preview when fragment contract check fails", async () => {
    const client = createClient(async () => ({
      html: "<div>Bad response</div>",
      warnings: [],
      raw: { status: "error" },
    }));

    const renderer = getPreviewRenderer("fragments");
    const result = await renderer.render(MULTI_COMPONENT_DOC, client);

    expect(result.mode).toBe("fragments");
    expect(result.foundryStatus).toBe("dry-run");
    expect(result.html).toBe("");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("propagates binding issues through the renderer result contract", async () => {
    const client = createClient(
      async () => makeFragmentResponse({
        "text-1": {
          nodeId: "text-1",
          component: "Text",
          html: '<p data-oods-component="Text">content.title</p>',
          cssRefs: ["css.base"],
        },
      }),
    );

    const renderer = getPreviewRenderer("fragments");
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

describe("isFoundryUnavailableError", () => {
  it("returns true for known unavailability error codes", () => {
    expect(isFoundryUnavailableError({ code: "CONNECTION_FAILED" })).toBe(true);
    expect(isFoundryUnavailableError({ code: "MISSING_BASE_URL" })).toBe(true);
    expect(isFoundryUnavailableError({ code: "NETWORK_ERROR" })).toBe(true);
    expect(isFoundryUnavailableError({ code: "TIMEOUT" })).toBe(true);
  });

  it("returns false for non-availability error codes", () => {
    expect(isFoundryUnavailableError({ code: "TOOL_ERROR" })).toBe(false);
    expect(isFoundryUnavailableError({ code: "VALIDATION_ERROR" })).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isFoundryUnavailableError(null)).toBe(false);
    expect(isFoundryUnavailableError(undefined)).toBe(false);
    expect(isFoundryUnavailableError("string")).toBe(false);
    expect(isFoundryUnavailableError(42)).toBe(false);
  });
});
