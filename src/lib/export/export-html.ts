import type { DesignDocument } from "@/types/document-model";
import type { TokenState } from "@/types/token-state";

const flattenToTokenPaths = (
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> => {
  const paths: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(
        paths,
        flattenToTokenPaths(value as Record<string, unknown>, path)
      );
    } else {
      paths[path] = String(value);
    }
  }
  return paths;
};

export type ExportHtmlOptions = {
  document: DesignDocument;
  tokens: TokenState;
  previewHtml: string;
  tokenAnnotations?: Record<string, string>;
};

const tokenPathToCssVarName = (path: string): string =>
  `--${path.replaceAll(".", "-")}`;

const sanitizeCssComment = (value: string): string =>
  value.replaceAll("*/", "* /").replace(/\s+/g, " ").trim();

const indentMarkup = (markup: string, spaces = 4): string => {
  const trimmed = markup.trim();
  if (!trimmed) {
    return "";
  }

  const indentation = " ".repeat(spaces);
  return trimmed
    .split("\n")
    .map((line) => `${indentation}${line}`)
    .join("\n");
};

/**
 * Generate a standalone HTML file with inlined CSS variables and component HTML.
 */
export function exportHtml(options: ExportHtmlOptions): string {
  const { document, tokens, previewHtml, tokenAnnotations = {} } = options;
  const title = document.metadata.title ?? "Exported Design";
  const description =
    document.metadata.description ??
    `Production HTML export for ${title}.`;

  const tokenPaths = flattenToTokenPaths(tokens as unknown as Record<string, unknown>);
  const cssVarBlock = Object.entries(tokenPaths)
    .map(([path, value]) => {
      const cssVarName = tokenPathToCssVarName(path);
      const annotation = tokenAnnotations[path];
      const annotationSuffix = annotation
        ? ` /* ${sanitizeCssComment(annotation)} */`
        : "";
      return `    ${cssVarName}: ${value};${annotationSuffix}`;
    })
    .join("\n");

  const formattedPreview = indentMarkup(previewHtml);
  const mainContent = formattedPreview
    ? formattedPreview
    : '    <section aria-label="Empty export">\n      <p>No composed content available.</p>\n    </section>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
${cssVarBlock}
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { min-height: 100%; }
    body {
      font-family: var(--typography-fontFamily-sans, system-ui, sans-serif);
      font-size: var(--typography-fontSize-base, 1rem);
      line-height: var(--typography-lineHeight-normal, 1.5);
      color: var(--colors-text-primary, #111);
      background: var(--colors-background, #fff);
      padding: var(--spacing-lg, 1.5rem);
    }
    .skip-link {
      position: absolute;
      left: -9999px;
      top: 0;
      z-index: 1000;
      padding: 0.5rem 0.75rem;
      background: var(--colors-primary, #3b82f6);
      color: #fff;
      border-radius: 0.25rem;
      text-decoration: none;
    }
    .skip-link:focus {
      left: 1rem;
      top: 1rem;
    }
    main[role="main"] {
      max-width: min(72rem, 100%);
      margin: 0 auto;
      padding: var(--spacing-xl, 2rem);
      border-radius: var(--radius-lg, 0.5rem);
      background: var(--colors-surface, #f8fafc);
      box-shadow: var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05));
      overflow-wrap: anywhere;
    }
    @media (max-width: 48rem) {
      body {
        padding: var(--spacing-md, 1rem);
      }
      main[role="main"] {
        padding: var(--spacing-lg, 1.5rem);
        border-radius: var(--radius-md, 0.375rem);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <main id="main-content" role="main" aria-label="${escapeHtml(title)}">
${mainContent}
  </main>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
