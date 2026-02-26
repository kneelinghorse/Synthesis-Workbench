"use client";

import { useCallback, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Download, Check, ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { downloadFile, getFilename, getMimeType } from "@/lib/export/download";
import { executeExportDesign } from "@/lib/runtime/tools/export-tools";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useProjectStateStore } from "@/lib/stores/project-state";

type ExportFormatOption = {
  format: string;
  label: string;
  description: string;
};

const EXPORT_FORMATS: ExportFormatOption[] = [
  { format: "html", label: "HTML", description: "Standalone HTML with inlined tokens" },
  { format: "json", label: "JSON", description: "Full design document + tokens + data" },
  { format: "yaml", label: "YAML", description: "Design document as YAML" },
  { format: "scss", label: "SCSS", description: "Token variables as SCSS" },
];

export const DesignExportButton = ({ className }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastExported, setLastExported] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const document = useDocumentStateStore((s) => s.document);
  const activeProjectSlug = useProjectStateStore((s) => s.activeProjectSlug);
  const activeDesignSlug = useProjectStateStore((s) => s.activeDesignSlug);

  const isDisabled = !document;

  const handleExport = useCallback(
    (format: string) => {
      setExporting(format);
      setError(null);
      setLastExported(null);

      // Use requestAnimationFrame to allow UI to update before sync export
      requestAnimationFrame(() => {
        try {
          const slug =
            activeDesignSlug ?? activeProjectSlug ?? "untitled-design";

          const result = executeExportDesign({
            requestId: `export-btn-${Date.now()}`,
            format,
            slug,
          });

          if (!result.exported || result.errors?.length) {
            setError(result.errors?.[0] ?? "Export failed");
            setExporting(null);
            return;
          }

          const filename = getFilename(slug, format);
          const mimeType = result.mimeType ?? getMimeType(format);

          downloadFile({
            content: result.content,
            filename,
            mimeType,
          });

          setLastExported(format);
          setExporting(null);

          // Clear success indicator after a moment
          setTimeout(() => setLastExported(null), 2000);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Export failed");
          setExporting(null);
        }
      });
    },
    [activeDesignSlug, activeProjectSlug]
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white transition hover:border-white/40 hover:bg-black/45 focus:border-white/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
            open && "border-white/40 bg-black/45",
            className
          )}
          aria-label="Export design"
        >
          <Download className="size-3" />
          Export
          <ChevronDown
            className={cn(
              "size-2.5 text-white/50 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-56 rounded-xl border border-white/12 bg-[#12141a] shadow-[0_16px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="border-b border-white/8 px-3 py-2">
            <span className="text-[11px] uppercase tracking-[0.25em] text-white/45">
              Export As
            </span>
          </div>

          {error ? (
            <div className="border-b border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="py-1">
            {EXPORT_FORMATS.map((opt) => {
              const isExporting = exporting === opt.format;
              const justExported = lastExported === opt.format;

              return (
                <button
                  key={opt.format}
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExport(opt.format)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition text-white/75 hover:bg-white/6 disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-white/90">
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[10px] text-white/40">
                      {opt.description}
                    </div>
                  </div>
                  {isExporting ? (
                    <Loader2 className="size-3 shrink-0 animate-spin text-white/50" />
                  ) : justExported ? (
                    <Check className="size-3 shrink-0 text-emerald-400" />
                  ) : (
                    <Download className="size-3 shrink-0 text-white/30" />
                  )}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
