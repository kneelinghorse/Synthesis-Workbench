import { extractBindingPath } from "@/lib/engine/data-binding";
import type {
  ComponentNode,
  ComponentProps,
  DesignDocument,
  DesignNode,
} from "@/types/document-model";
import type { TokenState } from "@/types/token-state";

import {
  extractThemeVariants,
  flattenToTokenPaths,
  tokenPathToCssVarName,
  tokenPathToScssVarName,
} from "./token-export-utils";

export type ComponentSpecDataBinding = {
  propPath: string;
  binding: string;
  dataPath: string;
};

export type ComponentSpecification = {
  id: string;
  ref: string;
  componentName: string;
  nodePath: string;
  props: ComponentProps;
  tokenDependencies: string[];
  dataBindings: ComponentSpecDataBinding[];
};

export type ExportComponentSpecOptions = {
  document: DesignDocument;
  tokens: TokenState;
};

export type ExportComponentSpecPayload = {
  documentTitle: string;
  exportedAt: string;
  componentCount: number;
  components: ComponentSpecification[];
};

type TokenLookup = {
  tokenPaths: Set<string>;
  cssVarToTokenPath: Record<string, string>;
  scssVarToTokenPath: Record<string, string>;
};

const DATA_BINDING_REGEX = /\$data(?:\.[a-zA-Z0-9_-]+)+/g;
const CSS_VAR_FUNCTION_REGEX = /var\(\s*(--[a-zA-Z0-9-_]+)\s*(?:,[^)]+)?\)/g;
const CSS_VAR_TOKEN_REGEX = /--[a-zA-Z0-9-_]+/g;
const SCSS_VAR_TOKEN_REGEX = /\$[a-zA-Z0-9-_]+/g;

const collectMatches = (value: string, regex: RegExp): string[] =>
  Array.from(value.matchAll(regex), (match) =>
    match[1] ? match[1] : match[0]
  );

const buildTokenLookup = (tokens: TokenState): TokenLookup => {
  const { baseTokens, themeVariants } = extractThemeVariants(
    tokens as unknown as Record<string, unknown>
  );

  const tokenPathSet = new Set<string>(Object.keys(flattenToTokenPaths(baseTokens)));
  for (const variantTokens of Object.values(themeVariants)) {
    for (const path of Object.keys(flattenToTokenPaths(variantTokens))) {
      tokenPathSet.add(path);
    }
  }

  const cssVarToTokenPath: Record<string, string> = {};
  const scssVarToTokenPath: Record<string, string> = {};
  for (const path of tokenPathSet) {
    cssVarToTokenPath[tokenPathToCssVarName(path)] = path;
    scssVarToTokenPath[tokenPathToScssVarName(path)] = path;
  }

  return {
    tokenPaths: tokenPathSet,
    cssVarToTokenPath,
    scssVarToTokenPath,
  };
};

const collectComponentNodes = (
  node: DesignNode,
  nodePath: string,
  acc: Array<{ node: ComponentNode; nodePath: string }>
): void => {
  if (node.nodeType === "component") {
    acc.push({ node, nodePath });
    return;
  }

  node.children.forEach((child, index) => {
    collectComponentNodes(child, `${nodePath}.children[${index}]`, acc);
  });
};

const collectPropInsights = (
  props: ComponentProps,
  lookup: TokenLookup
): { tokenDependencies: string[]; dataBindings: ComponentSpecDataBinding[] } => {
  const tokenDependencies = new Set<string>();
  const dataBindings = new Map<string, ComponentSpecDataBinding>();

  const addTokenDependency = (candidate: string): void => {
    if (lookup.tokenPaths.has(candidate)) {
      tokenDependencies.add(candidate);
    }
  };

  const addBinding = (propPath: string, binding: string): void => {
    const normalized = binding.startsWith("$data.")
      ? binding
      : `$data.${binding.replace(/^\$data\./, "")}`;
    const dataPath = normalized.slice("$data.".length);
    const key = `${propPath}|${normalized}`;
    dataBindings.set(key, {
      propPath,
      binding: normalized,
      dataPath,
    });
  };

  const inspectStringValue = (value: string, propPath: string): void => {
    const trimmed = value.trim();

    const exactBindingPath = extractBindingPath(trimmed);
    if (exactBindingPath) {
      addBinding(propPath, trimmed);
    }
    for (const binding of collectMatches(value, DATA_BINDING_REGEX)) {
      addBinding(propPath, binding);
    }

    if (lookup.tokenPaths.has(trimmed)) {
      addTokenDependency(trimmed);
    }

    for (const cssVarName of collectMatches(value, CSS_VAR_FUNCTION_REGEX)) {
      const tokenPath = lookup.cssVarToTokenPath[cssVarName];
      if (tokenPath) {
        addTokenDependency(tokenPath);
      }
    }

    for (const cssVarToken of collectMatches(value, CSS_VAR_TOKEN_REGEX)) {
      const tokenPath = lookup.cssVarToTokenPath[cssVarToken];
      if (tokenPath) {
        addTokenDependency(tokenPath);
      }
    }

    for (const scssVarToken of collectMatches(value, SCSS_VAR_TOKEN_REGEX)) {
      const tokenPath = lookup.scssVarToTokenPath[scssVarToken];
      if (tokenPath) {
        addTokenDependency(tokenPath);
      }
    }
  };

  const walkValue = (value: unknown, propPath: string): void => {
    if (typeof value === "string") {
      inspectStringValue(value, propPath);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        walkValue(entry, `${propPath}[${index}]`);
      });
      return;
    }

    if (typeof value === "object" && value !== null) {
      for (const [key, nestedValue] of Object.entries(value)) {
        walkValue(nestedValue, `${propPath}.${key}`);
      }
    }
  };

  for (const [propKey, propValue] of Object.entries(props)) {
    walkValue(propValue, propKey);
  }

  return {
    tokenDependencies: Array.from(tokenDependencies).sort((a, b) =>
      a.localeCompare(b)
    ),
    dataBindings: Array.from(dataBindings.values()).sort((a, b) => {
      const pathOrder = a.propPath.localeCompare(b.propPath);
      if (pathOrder !== 0) {
        return pathOrder;
      }
      return a.binding.localeCompare(b.binding);
    }),
  };
};

const getComponentName = (ref: string): string =>
  ref.includes(":") ? ref.split(":")[1] : ref;

export function buildComponentSpecifications(
  options: ExportComponentSpecOptions
): ComponentSpecification[] {
  const lookup = buildTokenLookup(options.tokens);
  const components: Array<{ node: ComponentNode; nodePath: string }> = [];
  collectComponentNodes(options.document.root, "root", components);

  return components.map(({ node, nodePath }) => {
    const insights = collectPropInsights(node.props, lookup);
    return {
      id: node.id,
      ref: node.ref,
      componentName: getComponentName(node.ref),
      nodePath,
      props: node.props,
      tokenDependencies: insights.tokenDependencies,
      dataBindings: insights.dataBindings,
    };
  });
}

export function exportComponentSpec(options: ExportComponentSpecOptions): string {
  const components = buildComponentSpecifications(options);
  const payload: ExportComponentSpecPayload = {
    documentTitle: options.document.metadata.title ?? "Untitled Design",
    exportedAt: new Date().toISOString(),
    componentCount: components.length,
    components,
  };

  return JSON.stringify(payload, null, 2);
}
