import type { TokenState } from "@/types/token-state";

import {
  extractThemeVariants,
  flattenToTokenPaths,
  resolveAnnotation,
  sanitizeCssComment,
  sortTokenEntries,
  tokenPathToCssVarName,
  type ThemeVariantMap,
} from "./token-export-utils";

export type ExportCssOptions = {
  tokens: TokenState;
  tokenAnnotations?: Record<string, string>;
  themeVariants?: ThemeVariantMap;
  /**
   * Optional media query overrides by theme name, for example:
   * { dark: "(prefers-color-scheme: dark)" }.
   */
  themeMediaQueries?: Record<string, string>;
};

export const DEFAULT_THEME_MEDIA_QUERIES: Record<string, string> = {
  dark: "(prefers-color-scheme: dark)",
  night: "(prefers-color-scheme: dark)",
  hc: "(prefers-contrast: more)",
  "high-contrast": "(prefers-contrast: more)",
};

const indentBlock = (content: string, prefix = "  "): string =>
  content
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

const buildVariableBlock = (
  selector: string,
  declarations: string[],
  indentation = "  "
): string => {
  if (declarations.length === 0) {
    return `${selector} {\n}`;
  }
  return `${selector} {\n${declarations
    .map((declaration) => `${indentation}${declaration}`)
    .join("\n")}\n}`;
};

const buildDeclarations = (
  tokenPaths: Record<string, string>,
  annotations: Record<string, string>,
  themeName?: string
): string[] =>
  sortTokenEntries(tokenPaths).map(([path, value]) => {
    const annotation = resolveAnnotation(annotations, path, themeName);
    const annotationSuffix = annotation
      ? ` /* ${sanitizeCssComment(annotation)} */`
      : "";
    return `${tokenPathToCssVarName(path)}: ${value};${annotationSuffix}`;
  });

const resolveThemeMediaQuery = (
  themeName: string,
  overrides?: Record<string, string>
): string | null =>
  overrides?.[themeName] ?? DEFAULT_THEME_MEDIA_QUERIES[themeName.toLowerCase()] ?? null;

const toThemeEntries = (themeVariants: ThemeVariantMap): [string, Record<string, unknown>][] =>
  Object.entries(themeVariants).sort(([a], [b]) => a.localeCompare(b));

export function exportCss(options: ExportCssOptions): string {
  const annotations = options.tokenAnnotations ?? {};
  const { baseTokens, themeVariants } = extractThemeVariants(
    options.tokens as unknown as Record<string, unknown>,
    options.themeVariants
  );

  const sections: string[] = [];
  const baseDeclarations = buildDeclarations(
    flattenToTokenPaths(baseTokens),
    annotations
  );
  sections.push(buildVariableBlock(":root", baseDeclarations));

  for (const [themeName, themeTokens] of toThemeEntries(themeVariants)) {
    const declarations = buildDeclarations(
      flattenToTokenPaths(themeTokens),
      annotations,
      themeName
    );
    if (declarations.length === 0) {
      continue;
    }

    const mediaQuery = resolveThemeMediaQuery(themeName, options.themeMediaQueries);
    if (mediaQuery) {
      const rootBlock = buildVariableBlock(":root", declarations, "    ");
      sections.push(`@media ${mediaQuery} {\n${indentBlock(rootBlock)}\n}`);
      continue;
    }

    sections.push(buildVariableBlock(`[data-theme="${themeName}"]`, declarations));
  }

  return `${sections.join("\n\n")}\n`;
}

/**
 * Optional helper for build systems that want one file per theme variant.
 */
export function exportCssThemeFiles(options: ExportCssOptions): Record<string, string> {
  const annotations = options.tokenAnnotations ?? {};
  const { baseTokens, themeVariants } = extractThemeVariants(
    options.tokens as unknown as Record<string, unknown>,
    options.themeVariants
  );

  const files: Record<string, string> = {
    "tokens.css": `${buildVariableBlock(
      ":root",
      buildDeclarations(flattenToTokenPaths(baseTokens), annotations)
    )}\n`,
  };

  for (const [themeName, themeTokens] of toThemeEntries(themeVariants)) {
    files[`tokens.${themeName}.css`] = `${buildVariableBlock(
      ":root",
      buildDeclarations(flattenToTokenPaths(themeTokens), annotations, themeName)
    )}\n`;
  }

  return files;
}
