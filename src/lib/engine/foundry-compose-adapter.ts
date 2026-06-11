/**
 * Foundry compose adapter — UiSchema -> DesignDocument (s21-m04).
 *
 * The REVERSE of `foundry-fragment-adapter`: `design_compose` returns a Forge
 * UiSchema (screens/children carrying `component`, `meta.label`, `layout`,
 * `style.spacingToken`), not a Workbench `DesignDocument`. This converter maps
 * that seed into the document model so the existing review loop (fragments
 * preview, comments, patch_node iteration) applies unchanged.
 *
 * Mapping rules (lossy by design — the document model is the contract):
 *   - A node WITH children becomes a native LayoutNode. Forge `stack` maps to
 *     stack; `inline` (horizontal, no Workbench equivalent) maps to a
 *     single-row grid (`columns` = child count); `grid` maps to grid; anything
 *     else defaults to stack. Token-valued spacing (`gapToken`,
 *     `style.spacingToken`) is dropped — the Workbench layout engine takes CSS
 *     gap values, and Forge re-applies its own spacing when components render.
 *   - A LEAF node with a component becomes a ComponentNode, preserving `id`
 *     (Forge's `${slot}-${counter}` instance anchor) AND `meta.label` (the
 *     durable slot anchor) — the two halves of the comment-anchor contract.
 *   - A slot label on a CONTAINER node cannot be represented (LayoutNode has no
 *     id/meta and never reaches Forge on render) — it is dropped with a loud
 *     warning. Downstream stays conservative: comments on such slots orphan
 *     rather than mis-pin (decision 141; the decision-137 multi-component-slot
 *     edge case).
 *
 * `metadata.version` is intentionally NOT taken from the composed schema: the
 * fragments render path derives its repl DSL version from it, and the composed
 * version (2026.02) describes the compose output, not the render contract.
 */

import type {
  ComponentNode,
  DesignDocument,
  DesignNode,
  GridLayout,
  LayoutNode,
  StackLayout,
} from "@/types/document-model";
import { safeParseDesignDocument } from "@/types/document-model.schema";

/**
 * Stamped into `metadata.tags` on every converted document. Marks the active
 * document as Forge-composed so the comment layer prefers durable entity-slot
 * anchors over fragile instance ids (decision 119 — instance ids do not
 * survive a Forge regenerate).
 */
export const FORGE_COMPOSED_TAG = "forge-composed";

export type UiSchemaConversionResult = {
  document: DesignDocument;
  /** Recoverable drops (skipped nodes, container labels) — surface these. */
  warnings: string[];
};

export type UiSchemaToDesignDocumentOptions = {
  /** Document title (also becomes the screen-root label on render). */
  title?: string;
};

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

/** Mirrors componentRefSchema: "oods:" + UpperCamel component name. */
const VALID_COMPONENT_NAME_RE = /^[A-Z][a-zA-Z0-9]*$/;

const STACK_ALIGN_VALUES = new Set(["start", "center", "end", "stretch"]);
const STACK_JUSTIFY_VALUES = new Set([
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
]);

const describeNode = (node: Record<string, unknown>): string =>
  toStringValue(node.id) ?? toStringValue(node.component) ?? "(unnamed node)";

const readLabel = (node: Record<string, unknown>): string | null =>
  isRecord(node.meta) ? toStringValue(node.meta.label) : null;

const convertLayout = (
  node: Record<string, unknown>,
  childCount: number,
): StackLayout | GridLayout => {
  const layout = isRecord(node.layout) ? node.layout : {};
  const type = toStringValue(layout.type);
  const align = toStringValue(layout.align);

  if (type === "grid") {
    const columns = layout.columns;
    return {
      type: "grid",
      columns:
        typeof columns === "number" || typeof columns === "string"
          ? columns
          : undefined,
    };
  }

  if (type === "inline") {
    // Horizontal row — the Workbench has no inline layout, so approximate with
    // a single-row grid. Inline alignment nuance is dropped.
    return { type: "grid", columns: Math.max(childCount, 1) };
  }

  const stack: StackLayout = { type: "stack" };
  if (align && STACK_ALIGN_VALUES.has(align)) {
    stack.align = align as StackLayout["align"];
  } else if (align && STACK_JUSTIFY_VALUES.has(align)) {
    stack.justify = align as StackLayout["justify"];
  }
  return stack;
};

const convertNode = (
  value: unknown,
  warnings: string[],
): DesignNode | null => {
  if (!isRecord(value)) {
    warnings.push("Skipped a malformed UiSchema node (not an object).");
    return null;
  }

  const children = Array.isArray(value.children) ? value.children : [];

  if (children.length > 0) {
    const label = readLabel(value);
    if (label) {
      warnings.push(
        `Slot label "${label}" on container "${describeNode(value)}" was dropped — ` +
          "labels persist only on leaf components, so comments on this slot will " +
          "not re-anchor across a regenerate.",
      );
    }

    const convertedChildren = children
      .map((child) => convertNode(child, warnings))
      .filter((child): child is DesignNode => child !== null);

    if (convertedChildren.length === 0) {
      warnings.push(
        `Skipped container "${describeNode(value)}" — none of its children were convertible.`,
      );
      return null;
    }

    return {
      nodeType: "layout",
      layout: convertLayout(value, convertedChildren.length),
      children: convertedChildren,
    } satisfies LayoutNode;
  }

  const component = toStringValue(value.component);
  if (!component || !VALID_COMPONENT_NAME_RE.test(component)) {
    warnings.push(
      `Skipped leaf "${describeNode(value)}" — component name ${
        component ? `"${component}" is not a valid OODS component name` : "is missing"
      }.`,
    );
    return null;
  }

  const id = toStringValue(value.id);
  if (!id) {
    warnings.push(`Skipped leaf component "${component}" — node id is missing.`);
    return null;
  }

  const label = readLabel(value);
  const node: ComponentNode = {
    nodeType: "component",
    id,
    ref: `oods:${component}`,
    props: isRecord(value.props) ? value.props : {},
  };
  if (label) {
    node.meta = { label };
  }
  return node;
};

/**
 * Convert a Forge `design_compose` UiSchema into a Workbench DesignDocument.
 *
 * Throws when the schema is structurally unusable (no screens / nothing
 * convertible / fails document validation); recoverable drops are returned as
 * warnings instead.
 */
export const uiSchemaToDesignDocument = (
  schema: unknown,
  options: UiSchemaToDesignDocumentOptions = {},
): UiSchemaConversionResult => {
  if (!isRecord(schema) || !Array.isArray(schema.screens)) {
    throw new Error("UiSchema is malformed: expected { screens: [...] }.");
  }

  const warnings: string[] = [];
  const screens = schema.screens
    .map((screen) => convertNode(screen, warnings))
    .filter((screen): screen is DesignNode => screen !== null);

  if (screens.length === 0) {
    throw new Error(
      `UiSchema conversion produced no usable nodes.${
        warnings.length ? ` ${warnings.join(" ")}` : ""
      }`,
    );
  }

  const root: DesignNode =
    screens.length === 1
      ? screens[0]
      : { nodeType: "layout", layout: { type: "stack" }, children: screens };

  const document: DesignDocument = {
    metadata: {
      ...(options.title ? { title: options.title } : {}),
      tags: [FORGE_COMPOSED_TAG],
      createdAt: new Date().toISOString(),
    },
    root,
  };

  const parsed = safeParseDesignDocument(document);
  if (!parsed.success) {
    throw new Error(
      `UiSchema conversion produced an invalid document: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return { document: parsed.data, warnings };
};

/** Is the document a Forge-composed seed (regenerate path)? */
export const isForgeComposedDocument = (
  document: Pick<DesignDocument, "metadata"> | null | undefined,
): boolean => Boolean(document?.metadata.tags?.includes(FORGE_COMPOSED_TAG));
