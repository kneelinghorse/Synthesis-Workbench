import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useTokenStateStore } from "@/lib/stores/token-state";
import { useDataContextStore } from "@/lib/stores/data-context";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { getExportFormat, listExportFormats } from "@/lib/export/format-registry";

export const EXPORT_DESIGN_TOOL_NAME = "export_design";

export type ExportFormat = string;

export type ExportDesignToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  format: ExportFormat;
  slug?: string;
};

export type ExportDesignToolResult = {
  exported: boolean;
  format: ExportFormat;
  formatName?: string;
  extension?: string;
  mimeType?: string;
  slug: string;
  content: string;
  errors?: string[];
  resolvedAt: string;
};

export function executeExportDesign(
  args: ExportDesignToolArgs
): ExportDesignToolResult {
  const slug = args.slug ?? "untitled";

  try {
    const document = useDocumentStateStore.getState().document;
    if (!document) {
      return {
        exported: false,
        format: args.format,
        slug,
        content: "",
        errors: ["No active design document. Load a document before exporting."],
        resolvedAt: new Date().toISOString(),
      };
    }

    const tokens = useTokenStateStore.getState().tokens;
    const tokenAnnotations = useTokenStateStore.getState().annotations;
    const dataContext = useDataContextStore.getState().context;
    const previewHtml = usePreviewStateStore.getState().html;

    const plugin = getExportFormat(args.format);
    if (!plugin) {
      const supportedFormats = listExportFormats()
        .map((registered) => `"${registered.format}"`)
        .join(", ");
      return {
        exported: false,
        format: args.format,
        slug,
        content: "",
        errors: [
          `Unsupported export format: "${args.format}". Use ${supportedFormats}.`,
        ],
        resolvedAt: new Date().toISOString(),
      };
    }

    const content = plugin.serialize({
      document,
      tokens,
      dataContext,
      previewHtml,
      tokenAnnotations,
    });

    return {
      exported: true,
      format: plugin.format,
      formatName: plugin.name,
      extension: plugin.extension,
      mimeType: plugin.mimeType,
      slug,
      content,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      exported: false,
      format: args.format,
      slug,
      content: "",
      errors: [error instanceof Error ? error.message : String(error)],
      resolvedAt: new Date().toISOString(),
    };
  }
}
