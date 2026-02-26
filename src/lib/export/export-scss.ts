import type { TokenState } from "@/types/token-state";

import {
  extractThemeVariants,
  flattenToTokenPaths,
  resolveAnnotation,
  sanitizeCssComment,
  sortTokenEntries,
  tokenPathToScssVarName,
  type ThemeVariantMap,
} from "./token-export-utils";

export type ExportScssOptions = {
  tokens: TokenState;
  tokenAnnotations?: Record<string, string>;
  themeVariants?: ThemeVariantMap;
};

const buildVariableLines = (
  tokenPaths: Record<string, string>,
  annotations: Record<string, string>,
  themeName?: string
): string[] =>
  sortTokenEntries(tokenPaths).map(([path, value]) => {
    const annotation = resolveAnnotation(annotations, path, themeName);
    const annotationSuffix = annotation
      ? ` /* ${sanitizeCssComment(annotation)} */`
      : "";
    return `${tokenPathToScssVarName(path)}: ${value};${annotationSuffix}`;
  });

const toThemeEntries = (themeVariants: ThemeVariantMap): [string, Record<string, unknown>][] =>
  Object.entries(themeVariants).sort(([a], [b]) => a.localeCompare(b));

const buildThemeMap = (
  themeName: string,
  tokenPaths: Record<string, string>,
  annotations: Record<string, string>
): string => {
  const entries = sortTokenEntries(tokenPaths).map(([path, value]) => {
    const annotation = resolveAnnotation(annotations, path, themeName);
    const annotationSuffix = annotation
      ? ` /* ${sanitizeCssComment(annotation)} */`
      : "";
    return `  ${path.replaceAll(".", "-")}: ${value},${annotationSuffix}`;
  });

  if (entries.length === 0) {
    return `$theme-${themeName}: ();`;
  }

  return `$theme-${themeName}: (\n${entries.join("\n")}\n);`;
};

export function exportScss(options: ExportScssOptions): string {
  const annotations = options.tokenAnnotations ?? {};
  const { baseTokens, themeVariants } = extractThemeVariants(
    options.tokens as unknown as Record<string, unknown>,
    options.themeVariants
  );

  const sections: string[] = [];
  const baseLines = buildVariableLines(
    flattenToTokenPaths(baseTokens),
    annotations
  );
  if (baseLines.length > 0) {
    sections.push(baseLines.join("\n"));
  }

  for (const [themeName, themeTokens] of toThemeEntries(themeVariants)) {
    sections.push(
      buildThemeMap(themeName, flattenToTokenPaths(themeTokens), annotations)
    );
  }

  return `${sections.join("\n\n")}\n`;
}
