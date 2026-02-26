import type { DataContext } from "@/lib/engine/data-binding";
import type { DesignDocument } from "@/types/document-model";
import type { TokenState } from "@/types/token-state";

import { exportComponentSpec } from "./export-component-spec";
import { exportCss } from "./export-css";
import { exportHtml } from "./export-html";
import { exportJson } from "./export-json";
import { exportScss } from "./export-scss";
import { exportYaml } from "./export-yaml";

export type ExportSerializeContext = {
  document: DesignDocument;
  tokens: TokenState;
  dataContext: DataContext;
  previewHtml: string;
  tokenAnnotations: Record<string, string>;
};

export type ExportFormatPlugin = {
  format: string;
  name: string;
  extension: string;
  serialize: (context: ExportSerializeContext) => string;
  mimeType?: string;
};

type RegisterExportFormatOptions = {
  overwrite?: boolean;
};

const normalizeFormat = (format: string): string =>
  format.trim().toLowerCase();

const normalizeExtension = (extension: string): string => {
  const trimmed = extension.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
};

export type ExportFormatRegistry = {
  register: (
    plugin: ExportFormatPlugin,
    options?: RegisterExportFormatOptions
  ) => void;
  get: (format: string) => ExportFormatPlugin | undefined;
  list: () => ExportFormatPlugin[];
};

export const createExportFormatRegistry = (
  initialPlugins: ExportFormatPlugin[] = []
): ExportFormatRegistry => {
  const plugins = new Map<string, ExportFormatPlugin>();

  const register = (
    plugin: ExportFormatPlugin,
    options: RegisterExportFormatOptions = {}
  ): void => {
    const key = normalizeFormat(plugin.format);
    if (!key) {
      throw new Error("Export format key is required.");
    }

    if (plugins.has(key) && !options.overwrite) {
      throw new Error(`Export format "${key}" is already registered.`);
    }

    plugins.set(key, {
      ...plugin,
      format: key,
      extension: normalizeExtension(plugin.extension),
    });
  };

  const get = (format: string): ExportFormatPlugin | undefined =>
    plugins.get(normalizeFormat(format));

  const list = (): ExportFormatPlugin[] =>
    Array.from(plugins.values()).sort((a, b) => a.format.localeCompare(b.format));

  for (const plugin of initialPlugins) {
    register(plugin, { overwrite: true });
  }

  return {
    register,
    get,
    list,
  };
};

export const BUILT_IN_EXPORT_PLUGINS: ExportFormatPlugin[] = [
  {
    format: "html",
    name: "Production HTML",
    extension: ".html",
    mimeType: "text/html",
    serialize: ({ document, tokens, previewHtml, tokenAnnotations }) =>
      exportHtml({
        document,
        tokens,
        previewHtml,
        tokenAnnotations,
      }),
  },
  {
    format: "json",
    name: "Design JSON",
    extension: ".json",
    mimeType: "application/json",
    serialize: ({ document, tokens, dataContext, tokenAnnotations }) =>
      exportJson({
        document,
        tokens,
        dataContext,
        tokenAnnotations,
      }),
  },
  {
    format: "yaml",
    name: "Design YAML",
    extension: ".design.yaml",
    mimeType: "text/yaml",
    serialize: ({ document, tokenAnnotations }) =>
      exportYaml({
        document,
        tokenAnnotations,
      }),
  },
  {
    format: "css",
    name: "CSS Token Variables",
    extension: ".css",
    mimeType: "text/css",
    serialize: ({ tokens, tokenAnnotations }) =>
      exportCss({
        tokens,
        tokenAnnotations,
      }),
  },
  {
    format: "scss",
    name: "SCSS Token Variables",
    extension: ".scss",
    mimeType: "text/x-scss",
    serialize: ({ tokens, tokenAnnotations }) =>
      exportScss({
        tokens,
        tokenAnnotations,
      }),
  },
  {
    format: "spec",
    name: "Component Specification",
    extension: ".spec.json",
    mimeType: "application/json",
    serialize: ({ document, tokens }) =>
      exportComponentSpec({
        document,
        tokens,
      }),
  },
];

const defaultExportFormatRegistry = createExportFormatRegistry(
  BUILT_IN_EXPORT_PLUGINS
);

export const registerExportFormat = (
  plugin: ExportFormatPlugin,
  options?: RegisterExportFormatOptions
): void => defaultExportFormatRegistry.register(plugin, options);

export const getExportFormat = (
  format: string
): ExportFormatPlugin | undefined =>
  defaultExportFormatRegistry.get(format);

export const listExportFormats = (): ExportFormatPlugin[] =>
  defaultExportFormatRegistry.list();
