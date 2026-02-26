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

const createClient = (
  renderImpl?: (schema: unknown) => Promise<FoundryRenderOutput>,
): FoundryMcpClient => ({
  render:
    vi.fn(renderImpl ?? (async () => ({ html: "<div>Rendered</div>", warnings: [], raw: null }))),
  validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
  buildTokens: vi.fn(async () => ({ raw: null })),
  fetchStructuredData: vi.fn(),
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

  it("isolates legacy composition rendering behind the same interface", async () => {
    const client = createClient(async (schema) => {
      const component = (schema as { component?: string }).component ?? "Unknown";
      return {
        html: `<div>${component}</div>`,
        warnings: [],
        raw: schema,
      };
    });

    const renderer = getPreviewRenderer("composition");
    const result = await renderer.render(MULTI_COMPONENT_DOC, client);

    expect(renderer.mode).toBe("composition");
    expect(result.mode).toBe("composition");
    expect(result.html).toContain('data-layout="stack"');
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
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
