import type { DataContext } from "@/lib/engine/data-binding";
import {
  SHOW_BINDING_EXPRESSION,
  resolveBindings,
} from "@/lib/engine/data-binding";
import type { CompositionError } from "@/lib/engine/composition-renderer";
import { collectComponents } from "@/lib/engine/composition-renderer";
import { enhanceFragment } from "@/lib/engine/fragment-enhancer";
import { renderGrid, renderStack } from "@/lib/engine/layout-engine";
import type { FoundryValidateOutput } from "@/lib/mcp/foundry-client";
import type {
  ComponentNode,
  DesignDocument,
  DesignNode,
  LayoutNode,
} from "@/types/document-model";
import { isComponentNode, isLayoutNode } from "@/types/document-model";

const DEFAULT_REPL_DSL_VERSION = "2025.11";

type FoundryFragmentScreenChild = {
  id: string;
  component: string;
  props?: Record<string, unknown>;
};

type FoundryFragmentSchema = {
  version: string;
  screens: Array<{
    id: "screen-root";
    component: "Stack";
    children: FoundryFragmentScreenChild[];
    meta?: {
      label?: string;
    };
  }>;
};

export type FoundryFragmentRenderInput = {
  mode: "full";
  schema: FoundryFragmentSchema;
  output: {
    format: "fragments";
    strict: false;
    includeCss: true;
  };
};

type FoundryValidationInput = {
  mode: "full";
  schema: FoundryFragmentSchema;
};

export type FoundryFragmentComponentIndex = {
  id: string;
  ref: string;
  component: string;
  order: number;
};

export type BuildFoundryFragmentRenderInputOptions = {
  dataContext?: DataContext;
  dslVersion?: string;
};

export type BuildFoundryFragmentRenderInputResult = {
  renderInput: FoundryFragmentRenderInput;
  validationInput: FoundryValidationInput;
  bindingErrors: CompositionError[];
  componentIndex: FoundryFragmentComponentIndex[];
};

type FragmentEntry = {
  nodeId: string;
  component: string;
  html: string;
  cssRefs: string[];
};

type FragmentIssue = {
  nodeId: string | null;
  message: string;
};

export type ParsedFoundryFragmentRenderOutput = {
  status: string | null;
  fragments: Map<string, FragmentEntry>;
  css: Record<string, string>;
  issues: FragmentIssue[];
};

type ComposeFoundryFragmentResult = {
  html: string;
  errors: CompositionError[];
};

type ComposeFoundryFragmentOptions = {
  useInlineStyles?: boolean;
  classPrefix?: string;
};

const FOUNDRY_PREVIEW_ROOT_ID = "oods-preview-root";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toStringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const normalizeComponentName = (ref: string): string => {
  const normalized = ref.replace(/^oods:/i, "").trim();
  return normalized || "UnknownComponent";
};

const resolveDslVersion = (
  document: DesignDocument,
  explicitVersion: string | undefined,
): string => {
  const candidates = [explicitVersion, document.metadata.version];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return DEFAULT_REPL_DSL_VERSION;
};

const mergeDataContext = (
  document: DesignDocument,
  optionsDataContext: DataContext | undefined,
): DataContext | undefined =>
  document.data || optionsDataContext
    ? { ...(document.data ?? {}), ...(optionsDataContext ?? {}) }
    : undefined;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderErrorFallback = (component: ComponentNode, message: string): string =>
  `<div data-component-error="true" style="border: 1px dashed #e53e3e; padding: 8px; color: #e53e3e; font-size: 12px;">[${escapeHtml(
    component.ref,
  )}] Render failed: ${escapeHtml(message)}</div>`;

const wrapComponent = (component: ComponentNode, html: string): string =>
  `<div data-component-id="${component.id}" data-component-ref="${component.ref}">${html}</div>`;

const parseIssueNodeId = (
  value: unknown,
  componentIndex: FoundryFragmentComponentIndex[],
): string | null => {
  if (isRecord(value)) {
    const explicitNodeId = toStringValue(value.nodeId);
    if (explicitNodeId) {
      return explicitNodeId;
    }

    const path = toStringValue(value.path);
    if (path) {
      const fragmentPathMatch = path.match(/^\/fragments\/([^/]+)(?:\/|$)/);
      if (fragmentPathMatch?.[1]) {
        return fragmentPathMatch[1];
      }

      const childIndexMatch = path.match(/^\/screens\/\d+\/children\/(\d+)(?:\/|$)/);
      if (childIndexMatch?.[1]) {
        const index = Number.parseInt(childIndexMatch[1], 10);
        if (Number.isInteger(index)) {
          return componentIndex[index]?.id ?? null;
        }
      }
    }
  }

  if (typeof value === "string") {
    const pathSuffixMatch = value.match(/\((\/[^)]+)\)\s*$/);
    const path = pathSuffixMatch?.[1];
    if (!path) {
      return null;
    }

    const fragmentPathMatch = path.match(/^\/fragments\/([^/]+)(?:\/|$)/);
    if (fragmentPathMatch?.[1]) {
      return fragmentPathMatch[1];
    }

    const childIndexMatch = path.match(/^\/screens\/\d+\/children\/(\d+)(?:\/|$)/);
    if (childIndexMatch?.[1]) {
      const index = Number.parseInt(childIndexMatch[1], 10);
      if (Number.isInteger(index)) {
        return componentIndex[index]?.id ?? null;
      }
    }
  }

  return null;
};

const normalizeIssueMessage = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim() || "Foundry reported an unknown fragment error.";
  }

  if (isRecord(value)) {
    const message = toStringValue(value.message);
    const code = toStringValue(value.code);
    if (message && code) {
      return `${code}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (code) {
      return code;
    }
  }

  return "Foundry reported an unknown fragment error.";
};

const resolveComponentProps = (
  component: ComponentNode,
  dataContext: DataContext | undefined,
  bindingErrors: CompositionError[],
): Record<string, unknown> => {
  if (!dataContext) {
    return component.props;
  }

  return resolveBindings(component.props, dataContext, {
    fallback: SHOW_BINDING_EXPRESSION,
    onIssue: (issue) => {
      bindingErrors.push({
        componentId: component.id,
        componentRef: component.ref,
        message: issue.message,
      });
    },
  });
};

export const buildFoundryFragmentRenderInput = (
  document: DesignDocument,
  options: BuildFoundryFragmentRenderInputOptions = {},
): BuildFoundryFragmentRenderInputResult => {
  const bindingErrors: CompositionError[] = [];
  const dataContext = mergeDataContext(document, options.dataContext);
  const components = collectComponents(document.root);
  const children: FoundryFragmentScreenChild[] = [];
  const componentIndex: FoundryFragmentComponentIndex[] = [];

  for (const [order, component] of components.entries()) {
    const resolvedProps = resolveComponentProps(component, dataContext, bindingErrors);
    const normalizedComponent = normalizeComponentName(component.ref);
    children.push({
      id: component.id,
      component: normalizedComponent,
      props: Object.keys(resolvedProps).length > 0 ? resolvedProps : undefined,
    });
    componentIndex.push({
      id: component.id,
      ref: component.ref,
      component: normalizedComponent,
      order,
    });
  }

  const schema: FoundryFragmentSchema = {
    version: resolveDslVersion(document, options.dslVersion),
    screens: [
      {
        id: "screen-root",
        component: "Stack",
        children,
        meta:
          typeof document.metadata.title === "string" &&
          document.metadata.title.trim().length > 0
            ? { label: document.metadata.title }
            : undefined,
      },
    ],
  };

  return {
    renderInput: {
      mode: "full",
      schema,
      output: {
        format: "fragments",
        strict: false,
        includeCss: true,
      },
    },
    validationInput: {
      mode: "full",
      schema,
    },
    bindingErrors,
    componentIndex,
  };
};

export const mapFoundryValidationErrors = (
  validation: FoundryValidateOutput,
  componentIndex: FoundryFragmentComponentIndex[],
): CompositionError[] => {
  return validation.errors.map((message) => {
    const nodeId = parseIssueNodeId(message, componentIndex);
    const component = componentIndex.find((entry) => entry.id === nodeId);
    return {
      componentId: nodeId ?? "_fragments",
      componentRef: component?.ref ?? "_fragments",
      message,
    };
  });
};

export const parseFoundryFragmentRenderOutput = (
  payload: unknown,
  componentIndex: FoundryFragmentComponentIndex[],
): ParsedFoundryFragmentRenderOutput => {
  const status = isRecord(payload) ? toStringValue(payload.status) : null;
  const fragments = new Map<string, FragmentEntry>();
  const css: Record<string, string> = {};
  const issues: FragmentIssue[] = [];

  if (!isRecord(payload)) {
    issues.push({
      nodeId: null,
      message: "Foundry fragment response is malformed (not an object).",
    });
    return {
      status,
      fragments,
      css,
      issues,
    };
  }

  if (isRecord(payload.css)) {
    for (const [key, value] of Object.entries(payload.css)) {
      const cssValue = toStringValue(value);
      if (cssValue) {
        css[key] = cssValue;
      }
    }
  }

  if (isRecord(payload.fragments)) {
    for (const [key, value] of Object.entries(payload.fragments)) {
      if (!isRecord(value)) {
        issues.push({
          nodeId: key,
          message: `Fragment entry "${key}" is malformed.`,
        });
        continue;
      }

      const nodeId = toStringValue(value.nodeId) ?? key;
      const component = toStringValue(value.component) ?? "UnknownComponent";
      const html = toStringValue(value.html);
      if (!html) {
        issues.push({
          nodeId,
          message: `Fragment "${key}" is missing html content.`,
        });
        continue;
      }

      fragments.set(key, {
        nodeId,
        component,
        html,
        cssRefs: toStringArray(value.cssRefs),
      });
    }
  }

  if (Array.isArray(payload.errors)) {
    for (const entry of payload.errors) {
      issues.push({
        nodeId: parseIssueNodeId(entry, componentIndex),
        message: normalizeIssueMessage(entry),
      });
    }
  }

  if (status === "error" && issues.length === 0) {
    issues.push({
      nodeId: null,
      message: "Foundry returned status=error without error details.",
    });
  }

  return {
    status,
    fragments,
    css,
    issues,
  };
};

const composeNode = (
  node: DesignNode,
  fragmentById: Map<string, FragmentEntry>,
  issueMap: Map<string, string[]>,
  errors: CompositionError[],
  usedCssRefs: string[],
  options: ComposeFoundryFragmentOptions,
): string => {
  if (isComponentNode(node)) {
    const fragment = fragmentById.get(node.id);
    const nodeIssues = issueMap.get(node.id) ?? [];
    if (nodeIssues.length > 0) {
      for (const message of nodeIssues) {
        errors.push({
          componentId: node.id,
          componentRef: node.ref,
          message,
        });
      }
    }

    const html = fragment
      ? enhanceFragment(
          fragment.html,
          normalizeComponentName(node.ref),
          node.props,
        )
      : renderErrorFallback(
          node,
          nodeIssues[0] ?? "Fragment missing from Foundry response.",
        );

    if (!fragment && nodeIssues.length === 0) {
      errors.push({
        componentId: node.id,
        componentRef: node.ref,
        message: "Fragment missing from Foundry response.",
      });
    }

    if (fragment) {
      for (const cssRef of fragment.cssRefs) {
        if (!usedCssRefs.includes(cssRef)) {
          usedCssRefs.push(cssRef);
        }
      }
    }

    return wrapComponent(node, html);
  }

  if (isLayoutNode(node)) {
    const childrenHtml = node.children.map((child) =>
      composeNode(child, fragmentById, issueMap, errors, usedCssRefs, options),
    );

    if (node.layout.type === "stack") {
      return renderStack(node.layout, childrenHtml, {
        useInlineStyles: options.useInlineStyles ?? true,
        classPrefix: options.classPrefix,
      });
    }

    if (node.layout.type === "grid") {
      return renderGrid(node.layout, childrenHtml, {
        useInlineStyles: options.useInlineStyles ?? true,
        classPrefix: options.classPrefix,
      });
    }
  }

  const unknownNode = node as LayoutNode | ComponentNode;
  throw new Error(`Unsupported document node for fragment composition: ${unknownNode.nodeType}`);
};

export const composeDocumentFromFoundryFragments = (
  document: DesignDocument,
  output: ParsedFoundryFragmentRenderOutput,
  options: ComposeFoundryFragmentOptions = {},
): ComposeFoundryFragmentResult => {
  const errors: CompositionError[] = [];
  const usedCssRefs: string[] = [];
  const issueMap = new Map<string, string[]>();
  const globalIssues: string[] = [];

  for (const issue of output.issues) {
    if (issue.nodeId) {
      const next = issueMap.get(issue.nodeId) ?? [];
      next.push(issue.message);
      issueMap.set(issue.nodeId, next);
    } else {
      globalIssues.push(issue.message);
    }
  }

  for (const message of globalIssues) {
    errors.push({
      componentId: "_fragments",
      componentRef: "_fragments",
      message,
    });
  }

  const composedBody = composeNode(
    document.root,
    output.fragments,
    issueMap,
    errors,
    usedCssRefs,
    options,
  );

  const cssChunks: string[] = [];
  for (const cssRef of usedCssRefs) {
    const cssEntry = output.css[cssRef];
    if (cssEntry) {
      cssChunks.push(cssEntry);
      continue;
    }
    errors.push({
      componentId: "_fragments",
      componentRef: "_fragments",
      message: `Missing CSS payload for fragment cssRef "${cssRef}".`,
    });
  }

  const cssBlock =
    cssChunks.length > 0
      ? `<style data-foundry-fragment-css="true">\n${cssChunks.join(
          "\n\n",
        )}\n</style>`
      : "";

  return {
    html: `${cssBlock}<div id="${FOUNDRY_PREVIEW_ROOT_ID}">${composedBody}</div>`,
    errors,
  };
};
