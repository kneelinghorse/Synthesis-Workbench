import type { DesignDocument } from "@/types/document-model";
import { toYAML } from "@/lib/persistence/design-serialization";

export type ExportYamlOptions = {
  document: DesignDocument;
  tokenAnnotations?: Record<string, string>;
};

/**
 * Generate a YAML source export using the existing persistence format.
 */
export function exportYaml(options: ExportYamlOptions): string {
  const baseYaml = toYAML(options.document);
  const annotations = options.tokenAnnotations ?? {};
  const annotationEntries = Object.entries(annotations).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  if (annotationEntries.length === 0) {
    return baseYaml;
  }

  const annotationYaml = annotationEntries
    .map(
      ([path, note]) =>
        `  ${JSON.stringify(path)}: ${JSON.stringify(note)}`
    )
    .join("\n");

  return `${baseYaml.trimEnd()}\n\ntoken_annotations:\n${annotationYaml}\n`;
}
