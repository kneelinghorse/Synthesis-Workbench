/**
 * Composition Renderer for Synthesis Workbench
 *
 * Orchestrates the rendering of a DesignDocument by combining the layout engine
 * (for LayoutNodes) with OODS repl.render (for ComponentNodes) to produce a
 * fully composed HTML document.
 *
 * Two-phase rendering strategy:
 *   Phase 1 — Collect all ComponentNodes, fire OODS renders in parallel
 *   Phase 2 — Walk tree depth-first, compose layout HTML with rendered fragments
 */

import type {
  DesignDocument,
  DesignNode,
  ComponentNode,
  LayoutNode,
} from '@/types/document-model';
import { isLayoutNode, isComponentNode } from '@/types/document-model';
import type { FoundryMcpClient, FoundryRenderOutput } from '@/lib/mcp/foundry-client';
import { renderStack, renderGrid } from '@/lib/engine/layout-engine';
import type { BindingResolutionIssue, DataContext } from '@/lib/engine/data-binding';
import { resolveBindings } from '@/lib/engine/data-binding';

// ============================================================================
// Types
// ============================================================================

/** Result of rendering a single component via OODS */
export interface ComponentRenderResult {
  id: string;
  ref: string;
  html: string;
  warnings?: string[];
  error?: string;
}

/** Result of composing a full document */
export interface CompositionResult {
  html: string;
  components: ComponentRenderResult[];
  errors: CompositionError[];
}

/** Error encountered during composition */
export interface CompositionError {
  componentId: string;
  componentRef: string;
  message: string;
}

/** Options for composition rendering */
export interface CompositionOptions {
  /** Use inline styles for layout containers (default: true) */
  useInlineStyles?: boolean;
  /** CSS class prefix when not using inline styles */
  classPrefix?: string;
  /** Data context for resolving $data.x bindings in component props */
  dataContext?: DataContext;
}

type ComponentSchemaBuildResult = {
  schema: Record<string, unknown>;
  bindingIssues: BindingResolutionIssue[];
};

// ============================================================================
// Phase 1 — Collect Components & Render in Parallel
// ============================================================================

/**
 * Collect all ComponentNodes from a document tree via depth-first traversal.
 */
export function collectComponents(node: DesignNode): ComponentNode[] {
  if (isComponentNode(node)) {
    return [node];
  }

  if (isLayoutNode(node)) {
    const results: ComponentNode[] = [];
    for (const child of node.children) {
      results.push(...collectComponents(child));
    }
    return results;
  }

  return [];
}

/**
 * Render a single component via OODS, returning a result with graceful error handling.
 */
async function renderComponentViaOods(
  component: ComponentNode,
  client: FoundryMcpClient,
  dataContext?: DataContext,
): Promise<ComponentRenderResult> {
  try {
    const { schema, bindingIssues } = buildComponentSchema(component, dataContext);
    if (bindingIssues.length > 0) {
      const message = bindingIssues.map((issue) => issue.message).join('; ');
      return {
        id: component.id,
        ref: component.ref,
        html: renderErrorFallback(component, message),
        error: message,
      };
    }

    const output: FoundryRenderOutput = await client.render(schema);
    return {
      id: component.id,
      ref: component.ref,
      html: output.html,
      warnings: output.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: component.id,
      ref: component.ref,
      html: renderErrorFallback(component, message),
      error: message,
    };
  }
}

/**
 * Build the schema payload sent to OODS repl.render for a ComponentNode.
 */
function buildComponentSchema(
  component: ComponentNode,
  dataContext?: DataContext,
): ComponentSchemaBuildResult {
  const bindingIssues = new Map<string, BindingResolutionIssue>();
  const componentName = component.ref.replace(/^oods:/, '');
  const props = dataContext
    ? resolveBindings(component.props, dataContext, {
      onIssue: (issue) => {
        bindingIssues.set(`${issue.code}:${issue.path}`, issue);
      },
    })
    : component.props;

  return {
    schema: {
      component: componentName,
      props,
    },
    bindingIssues: Array.from(bindingIssues.values()),
  };
}

/**
 * Render all components in parallel via OODS.
 * Returns a Map of componentId → rendered result.
 */
async function renderAllComponents(
  components: ComponentNode[],
  client: FoundryMcpClient,
  dataContext?: DataContext,
): Promise<Map<string, ComponentRenderResult>> {
  const results = await Promise.all(
    components.map((c) => renderComponentViaOods(c, client, dataContext)),
  );

  const map = new Map<string, ComponentRenderResult>();
  for (const result of results) {
    map.set(result.id, result);
  }
  return map;
}

// ============================================================================
// Phase 2 — Compose Tree
// ============================================================================

/**
 * Walk the tree depth-first and compose the final HTML.
 * ComponentNodes are replaced with their pre-rendered HTML fragments.
 * LayoutNodes are rendered by the layout engine wrapping their composed children.
 */
function composeNode(
  node: DesignNode,
  renderedComponents: Map<string, ComponentRenderResult>,
  options: CompositionOptions,
): string {
  if (isComponentNode(node)) {
    const rendered = renderedComponents.get(node.id);
    if (rendered) {
      return wrapComponent(node, rendered.html);
    }
    // Shouldn't happen if Phase 1 ran correctly, but degrade gracefully
    return wrapComponent(node, renderErrorFallback(node, 'Component not found in render map'));
  }

  if (isLayoutNode(node)) {
    return composeLayoutNode(node, renderedComponents, options);
  }

  throw new Error(`Unknown node type: ${(node as { nodeType: string }).nodeType}`);
}

/**
 * Compose a LayoutNode: recursively compose children, then wrap in layout container.
 */
function composeLayoutNode(
  node: LayoutNode,
  renderedComponents: Map<string, ComponentRenderResult>,
  options: CompositionOptions,
): string {
  const childrenHtml = node.children.map((child) =>
    composeNode(child, renderedComponents, options),
  );

  const renderOpts = {
    useInlineStyles: options.useInlineStyles ?? true,
    classPrefix: options.classPrefix,
  };

  if (node.layout.type === 'stack') {
    return renderStack(node.layout, childrenHtml, renderOpts);
  }

  if (node.layout.type === 'grid') {
    return renderGrid(node.layout, childrenHtml, renderOpts);
  }

  throw new Error(`Unknown layout type: ${(node.layout as { type: string }).type}`);
}

// ============================================================================
// HTML Helpers
// ============================================================================

/**
 * Wrap a rendered component fragment with an identifying container div.
 */
function wrapComponent(component: ComponentNode, html: string): string {
  return `<div data-component-id="${component.id}" data-component-ref="${component.ref}">${html}</div>`;
}

/**
 * Render an error fallback for a component that failed to render.
 */
function renderErrorFallback(component: ComponentNode, message: string): string {
  const safeMessage = escapeHtml(message);
  return `<div data-component-error="true" style="border: 1px dashed #e53e3e; padding: 8px; color: #e53e3e; font-size: 12px;">[${escapeHtml(component.ref)}] Render failed: ${safeMessage}</div>`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Render a complete DesignDocument into composed HTML.
 *
 * 1. Collects all ComponentNodes from the document tree
 * 2. Renders all components in parallel via OODS repl.render
 * 3. Walks the tree depth-first, composing layout and component HTML
 *
 * @param document - The DesignDocument to render
 * @param client - OODS Foundry MCP client for component rendering
 * @param options - Composition rendering options
 * @returns CompositionResult with composed HTML, component results, and any errors
 *
 * @example
 * ```ts
 * const result = await renderDocument(document, foundryClient);
 * if (result.errors.length > 0) {
 *   console.warn('Some components failed to render:', result.errors);
 * }
 * previewPane.setHtml(result.html);
 * ```
 */
export async function renderDocument(
  document: DesignDocument,
  client: FoundryMcpClient,
  options: CompositionOptions = {},
): Promise<CompositionResult> {
  // Phase 1: Collect and render all components in parallel
  // Merge document inline data with options.dataContext (options takes precedence)
  const dataContext = document.data || options.dataContext
    ? { ...(document.data ?? {}), ...(options.dataContext ?? {}) }
    : undefined;
  const components = collectComponents(document.root);
  const renderedComponents = await renderAllComponents(components, client, dataContext);

  // Phase 2: Compose the tree
  const html = composeNode(document.root, renderedComponents, options);

  // Gather results and errors
  const componentResults = Array.from(renderedComponents.values());
  const errors: CompositionError[] = componentResults
    .filter((r) => r.error !== undefined)
    .map((r) => ({
      componentId: r.id,
      componentRef: r.ref,
      message: r.error!,
    }));

  return { html, components: componentResults, errors };
}

/**
 * Render a single DesignNode subtree (not a full document).
 * Useful for re-rendering a branch after edits.
 */
export async function renderNode(
  node: DesignNode,
  client: FoundryMcpClient,
  options: CompositionOptions = {},
): Promise<CompositionResult> {
  const components = collectComponents(node);
  const renderedComponents = await renderAllComponents(components, client, options.dataContext);
  const html = composeNode(node, renderedComponents, options);

  const componentResults = Array.from(renderedComponents.values());
  const errors: CompositionError[] = componentResults
    .filter((r) => r.error !== undefined)
    .map((r) => ({
      componentId: r.id,
      componentRef: r.ref,
      message: r.error!,
    }));

  return { html, components: componentResults, errors };
}
