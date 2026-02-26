import type { DataContext } from "@/lib/engine/data-binding";
import type {
  CompositionError,
  CompositionResult,
} from "@/lib/engine/composition-renderer";
import { renderDocument } from "@/lib/engine/composition-renderer";
import { buildFoundryFullDocumentRenderInput } from "@/lib/engine/foundry-full-document";
import type { FoundryMcpClient } from "@/lib/mcp/foundry-client";
import type { DesignDocument } from "@/types/document-model";

export const PREVIEW_RENDERER_MODES = [
  "full-document",
  "composition",
] as const;

export type PreviewRendererMode = (typeof PREVIEW_RENDERER_MODES)[number];
export type LivePreviewStatus = "live" | "dry-run";

export type PreviewRenderResult = {
  html: string;
  errors: CompositionError[];
  foundryStatus: LivePreviewStatus;
  mode: PreviewRendererMode;
};

export interface PreviewRenderer {
  mode: PreviewRendererMode;
  render: (
    document: DesignDocument,
    client: FoundryMcpClient,
    options?: {
      dataContext?: DataContext;
    },
  ) => Promise<PreviewRenderResult>;
}

const isDryRunSummaryHtml = (html: string): boolean =>
  /data-foundry-render=(["'])summary\1/.test(html);

const toLivePreviewStatus = (html: string): LivePreviewStatus =>
  isDryRunSummaryHtml(html) ? "dry-run" : "live";

const fullDocumentPreviewRenderer: PreviewRenderer = {
  mode: "full-document",
  async render(document, client, options) {
    const input = buildFoundryFullDocumentRenderInput(document, {
      dataContext: options?.dataContext,
    });
    const output = await client.render(input.input);

    return {
      html: output.html,
      errors: input.bindingErrors,
      foundryStatus: toLivePreviewStatus(output.html),
      mode: "full-document",
    };
  },
};

const toCompositionPreviewResult = (
  result: CompositionResult,
): PreviewRenderResult => ({
  html: result.html,
  errors: result.errors,
  foundryStatus: toLivePreviewStatus(result.html),
  mode: "composition",
});

const compositionPreviewRenderer: PreviewRenderer = {
  mode: "composition",
  async render(document, client, options) {
    const result = await renderDocument(document, client, {
      dataContext: options?.dataContext,
    });
    return toCompositionPreviewResult(result);
  },
};

const isPreviewRendererMode = (
  value: string | undefined,
): value is PreviewRendererMode =>
  PREVIEW_RENDERER_MODES.some((mode) => mode === value);

const readConfiguredRendererMode = (): PreviewRendererMode => {
  const value =
    process.env.NEXT_PUBLIC_PREVIEW_RENDERER_MODE ??
    process.env.PREVIEW_RENDERER_MODE;
  return isPreviewRendererMode(value) ? value : "full-document";
};

export const getPreviewRenderer = (
  mode: PreviewRendererMode = readConfiguredRendererMode(),
): PreviewRenderer => {
  if (mode === "composition") {
    return compositionPreviewRenderer;
  }
  return fullDocumentPreviewRenderer;
};
