/* @vitest-environment jsdom */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCompositionPreview } from "./useCompositionPreview";
import { useDataContextStore } from "@/lib/stores/data-context";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import type {
  FoundryMcpClient,
  FoundryRenderOutput,
} from "@/lib/mcp/foundry-client";
import type { DesignDocument } from "@/types/document-model";

const DOC_WITH_BINDING: DesignDocument = {
  metadata: { title: "Data-bound Preview" },
  root: {
    nodeType: "component",
    id: "heading-1",
    ref: "oods:Text",
    props: {
      text: "$data.content.title",
    },
  },
};

const createSimpleDoc = (id: string, text: string): DesignDocument => ({
  metadata: { title: `Doc ${id}` },
  root: {
    nodeType: "component",
    id,
    ref: "oods:Text",
    props: { text },
  },
});

const MULTI_COMPONENT_DOC: DesignDocument = {
  metadata: { title: "Multi Component" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "hero-title",
        ref: "oods:Text",
        props: { text: "Hero" },
      },
      {
        nodeType: "component",
        id: "hero-subtitle",
        ref: "oods:Text",
        props: { text: "Subtitle" },
      },
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 2, gap: 12 },
        children: [
          {
            nodeType: "component",
            id: "cta-1",
            ref: "oods:Button",
            props: { label: "Primary CTA" },
          },
          {
            nodeType: "component",
            id: "cta-2",
            ref: "oods:Button",
            props: { label: "Secondary CTA" },
          },
        ],
      },
    ],
  },
};

type MockRenderNode = {
  id?: string;
  component?: string;
  props?: Record<string, unknown>;
  children?: MockRenderNode[];
};

type MockRenderInput = {
  mode?: string;
  schema?: {
    screens?: MockRenderNode[];
  };
};

const findFirstText = (
  nodes: MockRenderNode[] | undefined
): string | null => {
  if (!nodes) return null;
  for (const node of nodes) {
    const text = node.props?.text;
    if (typeof text === "string" && text.trim().length > 0) {
      return text;
    }
    const fromChildren = findFirstText(node.children);
    if (fromChildren) {
      return fromChildren;
    }
  }
  return null;
};

const createClient = (): FoundryMcpClient => ({
  render: vi.fn(async (schema: unknown) => {
    const input = schema as MockRenderInput;
    const text = findFirstText(input.schema?.screens) ?? "";
    return {
      html: `<div>${text}</div>`,
      warnings: [],
      raw: schema,
    } satisfies FoundryRenderOutput;
  }),
  validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
  buildTokens: vi.fn(async () => ({ raw: null })),
  fetchStructuredData: vi.fn(),
});

const HookHarness = ({ client }: { client: FoundryMcpClient | null }) => {
  useCompositionPreview(client);
  return null;
};

describe("useCompositionPreview", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    usePreviewStateStore.getState().reset();
    useDataContextStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it("re-renders when data context changes and updates preview output", async () => {
    const client = createClient();
    render(<HookHarness client={client} />);

    act(() => {
      useDataContextStore.getState().setContext({
        content: { title: "First title" },
      });
      useDocumentStateStore.getState().setDocument(DOC_WITH_BINDING);
    });

    await waitFor(() => {
      expect(usePreviewStateStore.getState().html).toContain("First title");
    });

    act(() => {
      useDataContextStore.getState().setContext({
        content: { title: "Updated title" },
      });
    });

    await waitFor(() => {
      expect(usePreviewStateStore.getState().html).toContain("Updated title");
    });
    expect(usePreviewStateStore.getState().foundryStatus).toBe("live");

    const renderCalls = (client.render as ReturnType<typeof vi.fn>).mock.calls;
    expect(renderCalls.length).toBeGreaterThanOrEqual(2);
    const finalCall = renderCalls[renderCalls.length - 1]?.[0] as MockRenderInput;
    expect(finalCall.mode).toBe("full");
    expect(finalCall.schema?.screens?.[0]).toEqual(
      expect.objectContaining({
        component: "Text",
        props: expect.objectContaining({ text: "Updated title" }),
      }),
    );
  });

  it("re-renders when a manual retry is requested", async () => {
    const client = createClient();
    render(<HookHarness client={client} />);

    act(() => {
      useDataContextStore.getState().setContext({
        content: { title: "Retry title" },
      });
      useDocumentStateStore.getState().setDocument(DOC_WITH_BINDING);
    });

    await waitFor(() => {
      expect((client.render as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    });

    act(() => {
      useDocumentStateStore.getState().requestRetry();
    });

    await waitFor(() => {
      expect((client.render as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });
  });

  it("debounces rapid document updates and renders only the latest state", async () => {
    const client = createClient();

    render(<HookHarness client={client} />);

    act(() => {
      useDocumentStateStore.getState().setDocument(
        createSimpleDoc("rapid-1", "First render")
      );
      useDocumentStateStore.getState().setDocument(
        createSimpleDoc("rapid-2", "Second render")
      );
    });

    await waitFor(() => {
      expect(usePreviewStateStore.getState().html).toContain("Second render");
    });

    const renderMock = client.render as ReturnType<typeof vi.fn>;
    expect(renderMock).toHaveBeenCalledTimes(1);
    const renderInput = renderMock.mock.calls[0]?.[0] as MockRenderInput;
    expect(renderInput).toEqual(
      expect.objectContaining({
        mode: "full",
        schema: expect.objectContaining({
          screens: expect.arrayContaining([
            expect.objectContaining({
              props: expect.objectContaining({
                text: "Second render",
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it("sends one full-document render call for multi-component documents", async () => {
    const client = createClient();
    render(<HookHarness client={client} />);

    act(() => {
      useDocumentStateStore.getState().setDocument(MULTI_COMPONENT_DOC);
    });

    await waitFor(() => {
      expect((client.render as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    });

    const input = (client.render as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as MockRenderInput;
    expect(input.mode).toBe("full");
    expect(input.schema?.screens?.[0]).toEqual(
      expect.objectContaining({
        id: "screen-root",
        component: "Stack",
      }),
    );
    expect(input.schema?.screens?.[0]?.children).toHaveLength(3);
  });

  it("falls back to static preview rendering when Foundry client is unavailable", async () => {
    render(<HookHarness client={null} />);

    act(() => {
      useDataContextStore.getState().setContext({
        content: { title: "Offline heading" },
      });
      useDocumentStateStore.getState().setDocument(DOC_WITH_BINDING);
    });

    await waitFor(() => {
      const html = usePreviewStateStore.getState().html;
      expect(html).toContain('data-static-preview="true"');
      expect(html).toContain("Offline heading");
    });
    expect(usePreviewStateStore.getState().foundryStatus).toBe("offline");
    expect(useDocumentStateStore.getState().compositionStatus).toBe("success");
  });

  it("falls back to static preview when Foundry becomes unavailable during render", async () => {
    const connectionError = Object.assign(new Error("Foundry connection dropped"), {
      code: "CONNECTION_FAILED",
    });

    const client: FoundryMcpClient = {
      render: vi.fn(async () => {
        throw connectionError;
      }),
      validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
      buildTokens: vi.fn(async () => ({ raw: null })),
      fetchStructuredData: vi.fn(),
    };

    render(<HookHarness client={client} />);
    act(() => {
      useDataContextStore.getState().setContext({
        content: { title: "Unavailable heading" },
      });
      useDocumentStateStore.getState().setDocument(DOC_WITH_BINDING);
    });

    await waitFor(() => {
      expect(usePreviewStateStore.getState().html).toContain('data-static-preview="true"');
    });
    expect(usePreviewStateStore.getState().foundryStatus).toBe("offline");
    expect(useDocumentStateStore.getState().compositionStatus).toBe("success");
  });

  it("does not use static fallback for non-availability Foundry errors", async () => {
    const toolError = Object.assign(new Error("Schema validation failed"), {
      code: "TOOL_ERROR",
    });

    const client: FoundryMcpClient = {
      render: vi.fn(async () => {
        throw toolError;
      }),
      validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
      buildTokens: vi.fn(async () => ({ raw: null })),
      fetchStructuredData: vi.fn(),
    };

    render(<HookHarness client={client} />);
    act(() => {
      useDocumentStateStore.getState().setDocument(createSimpleDoc("tool-error", "Fail"));
    });

    await waitFor(() => {
      expect(useDocumentStateStore.getState().compositionStatus).toBe("error");
    });
    expect(usePreviewStateStore.getState().html).not.toContain('data-static-preview="true"');
  });

  it("marks Foundry status as dry-run when summary HTML is returned", async () => {
    const client: FoundryMcpClient = {
      render: vi.fn(async () => ({
        html: '<div data-foundry-render="summary">Dry-run summary</div>',
        warnings: [],
        raw: null,
      })),
      validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
      buildTokens: vi.fn(async () => ({ raw: null })),
      fetchStructuredData: vi.fn(),
    };

    render(<HookHarness client={client} />);
    act(() => {
      useDocumentStateStore.getState().setDocument(
        createSimpleDoc("dry-run-1", "Dry-run check")
      );
    });

    await waitFor(() => {
      expect(usePreviewStateStore.getState().foundryStatus).toBe("dry-run");
    });
  });
});
