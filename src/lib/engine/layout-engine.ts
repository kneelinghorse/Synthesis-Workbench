/**
 * Layout Engine for Synthesis Workbench
 *
 * Renders LayoutNode primitives (stack, grid) as HTML/CSS.
 * These are native to the Workbench and not rendered by OODS.
 *
 * The engine walks a document tree and produces layout containers
 * that host OODS component fragments (provided by composition renderer).
 */

import type {
  LayoutNode,
  DesignNode,
  ComponentNode,
  StackLayout,
  GridLayout,
} from '@/types/document-model';
import { isLayoutNode, isComponentNode } from '@/types/document-model';

// ============================================================================
// Types
// ============================================================================

/**
 * HTML rendering result
 */
export interface RenderResult {
  html: string;
  css?: string;
}

/**
 * Options for rendering
 */
export interface RenderOptions {
  /**
   * Generate placeholder slots for ComponentNodes
   * These will be filled by the composition renderer
   */
  generatePlaceholders?: boolean;

  /**
   * Use inline styles instead of CSS classes
   */
  useInlineStyles?: boolean;

  /**
   * Custom class prefix for generated classes
   */
  classPrefix?: string;
}

// ============================================================================
// Stack Layout Rendering
// ============================================================================

/**
 * Render stack layout as HTML
 * Stacks children vertically with configurable gap, alignment, and justification
 */
export function renderStack(
  layout: StackLayout,
  children: string[],
  options: RenderOptions = {}
): string {
  const { useInlineStyles = true, classPrefix = 'layout' } = options;

  const styles = useInlineStyles
    ? buildStackInlineStyles(layout)
    : `class="${classPrefix}-stack"`;

  const childrenHtml = children.join('\n');

  return `<div ${styles} data-layout="stack">${childrenHtml}</div>`;
}

/**
 * Build inline CSS styles for stack layout
 */
function buildStackInlineStyles(layout: StackLayout): string {
  const styles: string[] = [
    'display: flex',
    'flex-direction: column',
  ];

  if (layout.gap !== undefined) {
    const gapValue = typeof layout.gap === 'number' ? `${layout.gap}px` : layout.gap;
    styles.push(`gap: ${gapValue}`);
  }

  if (layout.align) {
    // align maps to align-items in flex column
    styles.push(`align-items: ${layout.align}`);
  }

  if (layout.justify) {
    // justify maps to justify-content
    styles.push(`justify-content: ${layout.justify}`);
  }

  return `style="${styles.join('; ')}"`;
}

// ============================================================================
// Grid Layout Rendering
// ============================================================================

/**
 * Render grid layout as HTML
 * Uses CSS Grid with configurable columns, rows, and gap
 */
export function renderGrid(
  layout: GridLayout,
  children: string[],
  options: RenderOptions = {}
): string {
  const { useInlineStyles = true, classPrefix = 'layout' } = options;

  const styles = useInlineStyles
    ? buildGridInlineStyles(layout)
    : `class="${classPrefix}-grid"`;

  const childrenHtml = children.join('\n');

  return `<div ${styles} data-layout="grid">${childrenHtml}</div>`;
}

/**
 * Build inline CSS styles for grid layout
 */
function buildGridInlineStyles(layout: GridLayout): string {
  const styles: string[] = ['display: grid'];

  if (layout.columns !== undefined) {
    const columnsValue =
      typeof layout.columns === 'number'
        ? `repeat(${layout.columns}, 1fr)`
        : layout.columns;
    styles.push(`grid-template-columns: ${columnsValue}`);
  }

  if (layout.rows !== undefined) {
    const rowsValue =
      typeof layout.rows === 'number'
        ? `repeat(${layout.rows}, auto)`
        : layout.rows;
    styles.push(`grid-template-rows: ${rowsValue}`);
  }

  if (layout.gap !== undefined) {
    const gapValue = typeof layout.gap === 'number' ? `${layout.gap}px` : layout.gap;
    styles.push(`gap: ${gapValue}`);
  }

  if (layout.columnGap !== undefined) {
    const gapValue =
      typeof layout.columnGap === 'number' ? `${layout.columnGap}px` : layout.columnGap;
    styles.push(`column-gap: ${gapValue}`);
  }

  if (layout.rowGap !== undefined) {
    const gapValue =
      typeof layout.rowGap === 'number' ? `${layout.rowGap}px` : layout.rowGap;
    styles.push(`row-gap: ${gapValue}`);
  }

  return `style="${styles.join('; ')}"`;
}

// ============================================================================
// Component Placeholder Rendering
// ============================================================================

/**
 * Generate placeholder for a ComponentNode
 * These will be replaced by actual component HTML by the composition renderer
 */
export function renderComponentPlaceholder(component: ComponentNode): string {
  return `<div data-component-id="${component.id}" data-component-ref="${component.ref}" data-placeholder="true"></div>`;
}

// ============================================================================
// Layout Engine Core
// ============================================================================

/**
 * Render a DesignNode (either LayoutNode or ComponentNode)
 */
export function renderNode(
  node: DesignNode,
  options: RenderOptions = {}
): string {
  if (isLayoutNode(node)) {
    return renderLayoutNode(node, options);
  }

  if (isComponentNode(node)) {
    if (options.generatePlaceholders) {
      return renderComponentPlaceholder(node);
    }
    // If not generating placeholders, return empty string
    // (composition renderer will handle this)
    return '';
  }

  throw new Error(`Unknown node type: ${(node as any).nodeType}`);
}

/**
 * Render a LayoutNode with its children
 */
export function renderLayoutNode(
  node: LayoutNode,
  options: RenderOptions = {}
): string {
  // Recursively render all children
  const childrenHtml = node.children.map((child) =>
    renderNode(child, options)
  );

  // Render the layout container based on type
  if (node.layout.type === 'stack') {
    return renderStack(node.layout, childrenHtml, options);
  }

  if (node.layout.type === 'grid') {
    return renderGrid(node.layout, childrenHtml, options);
  }

  throw new Error(`Unknown layout type: ${(node.layout as any).type}`);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Render a complete document tree starting from a root node
 *
 * @param rootNode - The root DesignNode to render
 * @param options - Rendering options
 * @returns HTML string with rendered layout
 *
 * @example
 * ```ts
 * const html = renderTree(document.root, {
 *   generatePlaceholders: true,
 *   useInlineStyles: true,
 * });
 * ```
 */
export function renderTree(
  rootNode: DesignNode,
  options: RenderOptions = {}
): string {
  return renderNode(rootNode, {
    generatePlaceholders: true,
    useInlineStyles: true,
    ...options,
  });
}

/**
 * Render layout as HTML with CSS classes instead of inline styles
 * Returns both HTML and CSS string
 */
export function renderWithClasses(
  rootNode: DesignNode,
  options: Omit<RenderOptions, 'useInlineStyles'> = {}
): RenderResult {
  const html = renderNode(rootNode, {
    ...options,
    useInlineStyles: false,
  });

  const css = generateLayoutCSS(options.classPrefix);

  return { html, css };
}

/**
 * Generate CSS for layout classes
 */
function generateLayoutCSS(classPrefix: string = 'layout'): string {
  return `
.${classPrefix}-stack {
  display: flex;
  flex-direction: column;
}

.${classPrefix}-grid {
  display: grid;
}
  `.trim();
}
