/**
 * Document Model Schema for Synthesis Workbench
 *
 * Polymorphic document model for multi-component composition.
 * Defines the core types for design documents with discriminated unions.
 *
 * Key concepts:
 * - LayoutNode: Native Workbench layout primitives (stack, grid)
 * - ComponentNode: References to OODS components for rendering
 * - DesignNode: Union of LayoutNode and ComponentNode
 * - DesignDocument: Root container with metadata
 */

// ============================================================================
// Layout Nodes (Native to Workbench)
// ============================================================================

/**
 * Stack layout configuration
 * Renders children vertically with configurable gap
 */
export interface StackLayout {
  type: 'stack';
  gap?: number | string;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
}

/**
 * Grid layout configuration
 * Renders children in CSS grid with configurable columns and gap
 */
export interface GridLayout {
  type: 'grid';
  columns?: number | string;
  rows?: number | string;
  gap?: number | string;
  columnGap?: number | string;
  rowGap?: number | string;
}

/**
 * Layout node type discriminator
 * Union of all supported layout types
 */
export type LayoutType = StackLayout | GridLayout;

/**
 * LayoutNode: Container for layout primitives
 * Rendered natively by the Workbench (not OODS)
 * Can nest arbitrarily (stack in grid, grid in stack)
 */
export interface LayoutNode {
  nodeType: 'layout';
  layout: LayoutType;
  children: DesignNode[];
}

// ============================================================================
// Component Nodes (Rendered by OODS)
// ============================================================================

/**
 * Component props record
 * String key-value pairs passed to OODS component
 * Values can be primitives, objects, or $data.x binding expressions (reserved)
 */
export type ComponentProps = Record<string, unknown>;

/**
 * Component metadata carried through from Forge composition.
 * `label` is the durable slot name (`meta.label` from `design_compose`) — it
 * survives a Forge regenerate while node ids (`${slot}-${counter}`) do not, so
 * the comment layer anchors to it (`data-oods-label`).
 */
export interface ComponentMeta {
  label?: string;
}

/**
 * ComponentNode: Reference to an OODS component
 * - id: Required unique identifier for AI patching/diffing
 * - ref: Component reference in format "oods:ComponentName"
 * - props: Key-value properties passed to component
 * - meta: Optional Forge-composed metadata (durable slot label)
 *
 * Note: $data.x binding syntax is reserved in types but not implemented in runtime
 */
export interface ComponentNode {
  nodeType: 'component';
  id: string;
  ref: string; // Format: "oods:ComponentName" (e.g., "oods:Button", "oods:Card")
  props: ComponentProps;
  meta?: ComponentMeta;
}

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * DesignNode: Union of all node types
 * Discriminated by 'nodeType' field for type-safe pattern matching
 */
export type DesignNode = LayoutNode | ComponentNode;

// ============================================================================
// Document Root
// ============================================================================

/**
 * Document metadata
 */
export interface DocumentMetadata {
  title?: string;
  description?: string;
  author?: string;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

/**
 * DesignDocument: Root container for a design
 * Wraps metadata and the root node of the document tree
 */
export interface DesignDocument {
  metadata: DocumentMetadata;
  root: DesignNode;
  /** Optional inline data context for $data.x binding resolution */
  data?: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a node is a LayoutNode
 */
export function isLayoutNode(node: DesignNode): node is LayoutNode {
  return node.nodeType === 'layout';
}

/**
 * Type guard to check if a node is a ComponentNode
 */
export function isComponentNode(node: DesignNode): node is ComponentNode {
  return node.nodeType === 'component';
}

/**
 * Type guard to check if layout is stack
 */
export function isStackLayout(layout: LayoutType): layout is StackLayout {
  return layout.type === 'stack';
}

/**
 * Type guard to check if layout is grid
 */
export function isGridLayout(layout: LayoutType): layout is GridLayout {
  return layout.type === 'grid';
}

// ============================================================================
// Data Binding Syntax
// ============================================================================

/**
 * Binding expression type for runtime data binding support
 * Format: "$data.path.to.value"
 */
export type DataBinding = `$data.${string}`;

/**
 * Helper type to mark that a prop value can be a binding expression.
 */
export type PropValue<T = unknown> = T | DataBinding;
