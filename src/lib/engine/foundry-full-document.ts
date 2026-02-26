import type { DataContext } from "@/lib/engine/data-binding";
import {
  SHOW_BINDING_EXPRESSION,
  resolveBindings,
} from "@/lib/engine/data-binding";
import type { CompositionError } from "@/lib/engine/composition-renderer";
import type {
  ComponentNode,
  DesignDocument,
  DesignNode,
  LayoutType,
} from "@/types/document-model";
import { isComponentNode, isLayoutNode } from "@/types/document-model";

const DEFAULT_REPL_DSL_VERSION = "2025.11";

type FoundryUiLayoutAlign = "start" | "center" | "end" | "space-between";

type FoundryUiLayout = {
  type?: "stack" | "grid" | "inline" | "section" | "sidebar";
  align?: FoundryUiLayoutAlign;
  gapToken?: string;
};

type FoundryUiElement = {
  id: string;
  component: string;
  route?: string;
  layout?: FoundryUiLayout;
  props?: Record<string, unknown>;
  bindings?: Record<string, string>;
  children?: FoundryUiElement[];
  meta?: {
    label?: string;
    intent?: string;
    notes?: string;
  };
};

type FoundryUiSchema = {
  version: string;
  dsVersion?: string;
  theme?: string;
  screens: FoundryUiElement[];
};

export type FoundryFullDocumentRenderInput = {
  mode: "full";
  schema: FoundryUiSchema;
};

export type BuildFoundryRenderInputOptions = {
  dataContext?: DataContext;
  dslVersion?: string;
};

export type BuildFoundryRenderInputResult = {
  input: FoundryFullDocumentRenderInput;
  bindingErrors: CompositionError[];
};

const normalizeComponentName = (ref: string): string => {
  const normalized = ref.replace(/^oods:/i, "").trim();
  return normalized || "UnknownComponent";
};

const toLayoutAlign = (value: string | undefined): FoundryUiLayoutAlign | undefined => {
  if (value === "start" || value === "center" || value === "end" || value === "space-between") {
    return value;
  }
  if (value === "space-around") {
    return "space-between";
  }
  return undefined;
};

const toLayoutComponent = (): "Stack" => "Stack";

const toLayoutProps = (layout: LayoutType): Record<string, unknown> | undefined => {
  if (layout.type === "grid") {
    const props: Record<string, unknown> = {};
    props.layoutType = "grid";
    if (layout.columns !== undefined) props.columns = layout.columns;
    if (layout.rows !== undefined) props.rows = layout.rows;
    if (layout.gap !== undefined) props.gap = layout.gap;
    if (layout.columnGap !== undefined) props.columnGap = layout.columnGap;
    if (layout.rowGap !== undefined) props.rowGap = layout.rowGap;
    return Object.keys(props).length > 0 ? props : undefined;
  }

  const props: Record<string, unknown> = {};
  if (layout.gap !== undefined) props.gap = layout.gap;
  if (layout.align !== undefined) props.align = layout.align;
  if (layout.justify !== undefined) props.justify = layout.justify;
  return Object.keys(props).length > 0 ? props : undefined;
};

const syntheticLayoutId = (path: number[]): string =>
  path.length === 0 ? "screen-root" : `layout-${path.join("-")}`;

const resolveComponentProps = (
  component: ComponentNode,
  dataContext: DataContext | undefined,
  bindingErrors: CompositionError[]
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

const toFoundryElement = (
  node: DesignNode,
  path: number[],
  dataContext: DataContext | undefined,
  bindingErrors: CompositionError[]
): FoundryUiElement => {
  if (isComponentNode(node)) {
    const resolvedProps = resolveComponentProps(node, dataContext, bindingErrors);
    return {
      id: node.id,
      component: normalizeComponentName(node.ref),
      props: Object.keys(resolvedProps).length > 0 ? resolvedProps : undefined,
    };
  }

  if (isLayoutNode(node)) {
    const align = toLayoutAlign(
      (node.layout.type === "stack" ? node.layout.justify : undefined) ?? node.layout.align
    );
    const layout: FoundryUiLayout = {
      type: node.layout.type === "grid" ? "grid" : "stack",
      align,
    };
    const children = node.children.map((child, index) =>
      toFoundryElement(child, [...path, index], dataContext, bindingErrors)
    );
    return {
      id: syntheticLayoutId(path),
      component: toLayoutComponent(),
      layout,
      props: toLayoutProps(node.layout),
      children: children.length > 0 ? children : undefined,
    };
  }

  throw new Error(`Unsupported design node: ${(node as { nodeType?: string }).nodeType ?? "unknown"}`);
};

const mergeDataContext = (
  document: DesignDocument,
  optionsDataContext: DataContext | undefined
): DataContext | undefined =>
  document.data || optionsDataContext
    ? { ...(document.data ?? {}), ...(optionsDataContext ?? {}) }
    : undefined;

const resolveDslVersion = (
  document: DesignDocument,
  explicitVersion: string | undefined
): string => {
  const candidates = [explicitVersion, document.metadata.version];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return DEFAULT_REPL_DSL_VERSION;
};

export const buildFoundryFullDocumentRenderInput = (
  document: DesignDocument,
  options: BuildFoundryRenderInputOptions = {}
): BuildFoundryRenderInputResult => {
  const bindingErrors: CompositionError[] = [];
  const dataContext = mergeDataContext(document, options.dataContext);

  const rootScreen = toFoundryElement(document.root, [], dataContext, bindingErrors);
  const screenWithLabel =
    document.metadata.title && !rootScreen.meta?.label
      ? {
          ...rootScreen,
          meta: {
            ...(rootScreen.meta ?? {}),
            label: document.metadata.title,
          },
        }
      : rootScreen;

  return {
    input: {
      mode: "full",
      schema: {
        version: resolveDslVersion(document, options.dslVersion),
        screens: [screenWithLabel],
      },
    },
    bindingErrors,
  };
};

const UNAVAILABLE_ERROR_CODES = new Set([
  "MISSING_BASE_URL",
  "CONNECTION_FAILED",
  "NETWORK_ERROR",
  "TIMEOUT",
]);

export const isFoundryUnavailableError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && UNAVAILABLE_ERROR_CODES.has(code);
};
