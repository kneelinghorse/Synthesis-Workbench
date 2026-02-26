import type { DataContext } from "@/lib/engine/data-binding";
import type { CompositionError } from "@/lib/engine/composition-renderer";
import { evaluateFoundryFragmentContract } from "@/lib/engine/foundry-fragment-contract";
import {
  buildFoundryFragmentRenderInput,
  composeDocumentFromFoundryFragments,
  mapFoundryValidationErrors,
  parseFoundryFragmentRenderOutput,
} from "@/lib/engine/foundry-fragment-adapter";
import { buildFoundryFullDocumentRenderInput } from "@/lib/engine/foundry-full-document";
import type { FoundryMcpClient } from "@/lib/mcp/foundry-client";
import type { DesignDocument } from "@/types/document-model";

export const PREVIEW_RENDERER_MODES = [
  "full-document",
  "fragments",
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

const toContractErrors = (
  checks: ReturnType<typeof evaluateFoundryFragmentContract>["checks"],
): CompositionError[] =>
  checks
    .filter((check) => !check.pass)
    .map((check) => ({
      componentId: "_fragments",
      componentRef: "_fragments",
      message: `${check.id}: ${check.detail}`,
    }));

const fragmentPreviewRenderer: PreviewRenderer = {
  mode: "fragments",
  async render(document, client, options) {
    const prepared = buildFoundryFragmentRenderInput(document, {
      dataContext: options?.dataContext,
    });

    const validation = await client.validate(prepared.validationInput);
    if (!validation.valid) {
      const validationErrors = mapFoundryValidationErrors(
        validation,
        prepared.componentIndex,
      );
      const fallback = await fullDocumentPreviewRenderer.render(
        document,
        client,
        options,
      );
      return {
        ...fallback,
        mode: "fragments",
        errors: [
          ...fallback.errors,
          ...validationErrors,
        ],
      };
    }

    const output = await client.render(prepared.renderInput);

    const contract = evaluateFoundryFragmentContract(output.raw, {
      expectedNodeIds: prepared.componentIndex.map((entry) => entry.id),
      acceptedIsolationModes: ["none", "isolated", "global-failure"],
      expectedStrict: false,
    });

    if (!contract.pass) {
      const fallback = await fullDocumentPreviewRenderer.render(
        document,
        client,
        options,
      );
      return {
        ...fallback,
        mode: "fragments",
        errors: [
          ...fallback.errors,
          ...toContractErrors(contract.checks),
        ],
      };
    }

    const parsedOutput = parseFoundryFragmentRenderOutput(
      output.raw,
      prepared.componentIndex,
    );
    const composed = composeDocumentFromFoundryFragments(document, parsedOutput);

    return {
      html: composed.html,
      errors: [...prepared.bindingErrors, ...composed.errors],
      foundryStatus: "live",
      mode: "fragments",
    };
  },
};

const compositionAliasPreviewRenderer: PreviewRenderer = {
  mode: "composition",
  async render(document, client, options) {
    const result = await fragmentPreviewRenderer.render(document, client, options);
    return {
      ...result,
      mode: "composition",
    };
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
  if (mode === "fragments") {
    return fragmentPreviewRenderer;
  }
  if (mode === "composition") {
    return compositionAliasPreviewRenderer;
  }
  return fullDocumentPreviewRenderer;
};
