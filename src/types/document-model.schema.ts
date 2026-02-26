/**
 * Document Model Zod Validation Schemas
 *
 * Runtime validation schemas for the document model types.
 * Provides parsing, validation, and type inference for design documents.
 */

import { z } from 'zod';
import type {
  StackLayout,
  GridLayout,
  LayoutType,
  LayoutNode,
  ComponentNode,
  DesignNode,
  DocumentMetadata,
  DesignDocument,
  ComponentProps,
} from './document-model';

// ============================================================================
// Layout Schemas
// ============================================================================

/**
 * Stack layout schema
 */
export const stackLayoutSchema = z.object({
  type: z.literal('stack'),
  gap: z.union([z.number(), z.string()]).optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  justify: z
    .enum(['start', 'center', 'end', 'space-between', 'space-around'])
    .optional(),
}) satisfies z.ZodType<StackLayout>;

/**
 * Grid layout schema
 */
export const gridLayoutSchema = z.object({
  type: z.literal('grid'),
  columns: z.union([z.number(), z.string()]).optional(),
  rows: z.union([z.number(), z.string()]).optional(),
  gap: z.union([z.number(), z.string()]).optional(),
  columnGap: z.union([z.number(), z.string()]).optional(),
  rowGap: z.union([z.number(), z.string()]).optional(),
}) satisfies z.ZodType<GridLayout>;

/**
 * Layout type discriminated union schema
 */
export const layoutTypeSchema = z.discriminatedUnion('type', [
  stackLayoutSchema,
  gridLayoutSchema,
]) satisfies z.ZodType<LayoutType>;

// ============================================================================
// Node Schemas
// ============================================================================

/**
 * Component props schema
 * Accepts any record of string keys to unknown values
 */
export const componentPropsSchema = z.record(
  z.string(),
  z.unknown()
) satisfies z.ZodType<ComponentProps>;

/**
 * Component reference validation
 * Must follow format: "oods:ComponentName"
 */
export const componentRefSchema = z
  .string()
  .regex(/^oods:[A-Z][a-zA-Z0-9]*$/, {
    message:
      'Component ref must follow format "oods:ComponentName" (e.g., "oods:Button", "oods:Card")',
  });

/**
 * ComponentNode schema
 */
export const componentNodeSchema = z.object({
  nodeType: z.literal('component'),
  id: z.string().min(1, 'Component id is required'),
  ref: componentRefSchema,
  props: componentPropsSchema,
}) satisfies z.ZodType<ComponentNode>;

/**
 * LayoutNode schema (recursive with lazy evaluation)
 */
const _layoutNodeSchema = z.object({
  nodeType: z.literal('layout'),
  layout: layoutTypeSchema,
  children: z.lazy(() => designNodeSchema.array()),
});

export const layoutNodeSchema = _layoutNodeSchema as unknown as typeof _layoutNodeSchema & z.ZodType<LayoutNode>;

/**
 * DesignNode discriminated union schema
 */
export const designNodeSchema: z.ZodType<DesignNode> = z.discriminatedUnion('nodeType', [
  _layoutNodeSchema,
  componentNodeSchema,
]);

// ============================================================================
// Document Schemas
// ============================================================================

/**
 * Document metadata schema
 */
export const documentMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  version: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
}) satisfies z.ZodType<DocumentMetadata>;

/**
 * DesignDocument root schema
 */
export const designDocumentSchema = z.object({
  metadata: documentMetadataSchema,
  root: designNodeSchema,
  data: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<DesignDocument>;

// ============================================================================
// Parsing Utilities
// ============================================================================

/**
 * Parse and validate a design document from unknown data
 * Throws ZodError if validation fails
 */
export function parseDesignDocument(data: unknown): DesignDocument {
  return designDocumentSchema.parse(data);
}

/**
 * Safely parse a design document
 * Returns success/error result instead of throwing
 */
export function safeParseDesignDocument(data: unknown) {
  return designDocumentSchema.safeParse(data);
}

/**
 * Parse a design node from unknown data
 * Useful for parsing subtrees
 */
export function parseDesignNode(data: unknown): DesignNode {
  return designNodeSchema.parse(data);
}

/**
 * Safely parse a design node
 */
export function safeParseDesignNode(data: unknown) {
  return designNodeSchema.safeParse(data);
}

/**
 * Validate component reference format
 */
export function parseComponentRef(ref: string): string {
  return componentRefSchema.parse(ref);
}

/**
 * Check if a string is a valid component reference
 */
export function isValidComponentRef(ref: string): boolean {
  return componentRefSchema.safeParse(ref).success;
}

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Inferred types from schemas (should match imported types)
 */
export type InferredDesignDocument = z.infer<typeof designDocumentSchema>;
export type InferredDesignNode = z.infer<typeof designNodeSchema>;
export type InferredLayoutNode = z.infer<typeof layoutNodeSchema>;
export type InferredComponentNode = z.infer<typeof componentNodeSchema>;
export type InferredDocumentMetadata = z.infer<typeof documentMetadataSchema>;
