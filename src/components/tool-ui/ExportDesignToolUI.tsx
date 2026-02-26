"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ToolOutputCard,
  ToolOutputCardBody,
  ToolOutputCardCallout,
  ToolOutputCardDescription,
  ToolOutputCardEyebrow,
  ToolOutputCardHeader,
  ToolOutputCardHeading,
  ToolOutputCardMeta,
  ToolOutputCardStatus,
  ToolOutputCardTitle,
} from "@/components/tool-ui/ToolOutputCard";
import {
  copyToClipboard,
  downloadFile,
  getFilename,
  getMimeType,
} from "@/lib/export/download";
import {
  EXPORT_DESIGN_TOOL_NAME,
  executeExportDesign,
  type ExportDesignToolArgs,
  type ExportDesignToolResult,
} from "@/lib/runtime/tools/export-tools";

const ExportDesignToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<
  ExportDesignToolArgs,
  ExportDesignToolResult
>) => {
  const [exporting, setExporting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const exportTriggered = useRef(false);

  const resolved = Boolean(result);
  const format = args?.format ?? "html";
  const slug = args?.slug ?? "untitled";
  const resolvedFormat = result?.format ?? format;
  const resolvedFormatLabel = result?.formatName ?? resolvedFormat.toUpperCase();
  const resolvedExtension = result?.extension;
  const resolvedFilename = resolvedExtension
    ? `${slug}${resolvedExtension.startsWith(".") ? resolvedExtension : `.${resolvedExtension}`}`
    : getFilename(slug, resolvedFormat);

  const requestId = args?.requestId ?? "unknown";
  const title = args?.title ?? "Export design";
  const prompt =
    args?.prompt ?? `Export the design as ${format.toUpperCase()}.`;

  useEffect(() => {
    if (exportTriggered.current || resolved || isError) return;
    if (!args?.format) return;

    setExporting(true);
    try {
      const output = executeExportDesign(args);
      addResult(output);
    } finally {
      setExporting(false);
      exportTriggered.current = true;
    }
  }, [addResult, args, isError, resolved]);

  const handleDownload = useCallback(() => {
    if (!result?.exported || !result.content) return;

    const filename = resolvedFilename;
    const mimeType = result.mimeType ?? getMimeType(resolvedFormat);
    downloadFile({ content: result.content, filename, mimeType });
  }, [result, resolvedFilename, resolvedFormat]);

  const handleCopy = useCallback(async () => {
    if (!result?.exported || !result.content) return;

    const success = await copyToClipboard(result.content);
    setCopyFeedback(success ? "Copied!" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  }, [result]);

  const errors = result?.errors ?? [];

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Export</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Request ID: {requestId}</div>
            <div>Format: {resolvedFormatLabel}</div>
            <div>Slug: {slug}</div>
            <div>
              Status:{" "}
              {exporting
                ? "Exporting"
                : resolved
                  ? result?.exported
                    ? "Complete"
                    : "Failed"
                  : "Ready"}
            </div>
          </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {resolved && result?.exported ? (
          <ToolOutputCardCallout tone="success" className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
                Export complete
              </div>
              <div className="text-sm font-medium text-emerald-50">
                {resolvedFormatLabel} export generated ({result.content.length}{" "}
                characters).
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/30"
              >
                Download {resolvedFilename}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
              >
                {copyFeedback ?? "Copy to Clipboard"}
              </button>
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-red-100/70">
              Export failed
            </div>
            <div className="space-y-1 text-sm text-red-50">
              {errors.map((error, index) => (
                <div key={`err-${index}`}>{error}</div>
              ))}
            </div>
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const ExportDesignToolUI = makeAssistantToolUI<
  ExportDesignToolArgs,
  ExportDesignToolResult
>({
  toolName: EXPORT_DESIGN_TOOL_NAME,
  render: ExportDesignToolCard,
});
