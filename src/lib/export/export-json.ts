import type { DesignDocument } from "@/types/document-model";
import type { TokenState } from "@/types/token-state";
import type { DataContext } from "@/lib/engine/data-binding";

export type ExportJsonOptions = {
  document: DesignDocument;
  tokens: TokenState;
  dataContext: DataContext;
  tokenAnnotations?: Record<string, string>;
};

export type ExportJsonPayload = {
  document: DesignDocument;
  tokenState: TokenState;
  tokenAnnotations: Record<string, string>;
  dataContext: DataContext;
  exportedAt: string;
};

/**
 * Generate a JSON interchange export with the full DesignDocument,
 * resolved TokenState, and DataContext.
 */
export function exportJson(options: ExportJsonOptions): string {
  const payload: ExportJsonPayload = {
    document: options.document,
    tokenState: options.tokens,
    tokenAnnotations: options.tokenAnnotations ?? {},
    dataContext: options.dataContext,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}
