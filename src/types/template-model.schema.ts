/**
 * Template Model Zod Validation Schemas
 *
 * Defines the reusable template file format. Templates are intentionally
 * distinct from design instances via `kind: "template"` and nested `document`.
 */

import { z } from 'zod';

import type { DesignNode } from './document-model';
import { componentRefSchema, designDocumentSchema } from './document-model.schema';
import type {
  DesignTemplate,
  TemplateCategory,
  TemplateDataField,
  TemplateDataShape,
  TemplateMetadata,
  TemplateTokenOverrides,
} from './template-model';
import { TEMPLATE_CATEGORIES, TEMPLATE_DATA_TYPES } from './template-model';

// ============================================================================
// Metadata and Data Shape Schemas
// ============================================================================

export const templateCategorySchema = z.enum(
  TEMPLATE_CATEGORIES
) satisfies z.ZodType<TemplateCategory>;

export const templateMetadataSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().min(1, 'Template description is required'),
  category: templateCategorySchema,
  previewThumbnail: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  author: z.string().optional(),
  version: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}) satisfies z.ZodType<TemplateMetadata>;

export const templateDataTypeSchema = z.enum(TEMPLATE_DATA_TYPES);

export const templateDataFieldSchema = z.object({
  type: templateDataTypeSchema,
  required: z.boolean().optional(),
  description: z.string().optional(),
  example: z.unknown().optional(),
}) satisfies z.ZodType<TemplateDataField>;

export const templateDataShapeSchema = z.record(
  z.string().min(1, 'Data shape key is required'),
  templateDataFieldSchema
) satisfies z.ZodType<TemplateDataShape>;

export const templateTokenOverridesSchema = z.record(
  z.string().min(1, 'Token override key is required'),
  z.unknown()
) satisfies z.ZodType<TemplateTokenOverrides>;

// ============================================================================
// Template Schema
// ============================================================================

function collectComponentRefs(node: DesignNode, refs: Set<string>): void {
  if (node.nodeType === 'component') {
    refs.add(node.ref);
    return;
  }

  for (const child of node.children) {
    collectComponentRefs(child, refs);
  }
}

/**
 * Distinct template file shape (YAML):
 * - kind: template
 * - metadata: template metadata for discovery
 * - document: reusable DesignDocument skeleton
 * - tokenOverrides/dataShape/requiredComponents: reusable configuration
 */
export const designTemplateSchema = z
  .object({
    kind: z.literal('template'),
    metadata: templateMetadataSchema,
    document: designDocumentSchema,
    tokenOverrides: templateTokenOverridesSchema.optional(),
    dataShape: templateDataShapeSchema.optional(),
    requiredComponents: z.array(componentRefSchema).optional(),
  })
  .superRefine((template, ctx) => {
    if (!template.requiredComponents || template.requiredComponents.length === 0) {
      return;
    }

    const seen = new Set<string>();
    for (const [index, ref] of template.requiredComponents.entries()) {
      if (seen.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiredComponents', index],
          message: `Duplicate required component reference: ${ref}`,
        });
      } else {
        seen.add(ref);
      }
    }

    const usedRefs = new Set<string>();
    collectComponentRefs(template.document.root, usedRefs);

    for (const [index, ref] of template.requiredComponents.entries()) {
      if (!usedRefs.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiredComponents', index],
          message: `Required component "${ref}" is not present in template.document`,
        });
      }
    }
  }) satisfies z.ZodType<DesignTemplate>;

// ============================================================================
// Parsing Utilities
// ============================================================================

export function parseDesignTemplate(data: unknown): DesignTemplate {
  return designTemplateSchema.parse(data);
}

export function safeParseDesignTemplate(data: unknown) {
  return designTemplateSchema.safeParse(data);
}

export function isTemplateFilePayload(data: unknown): data is { kind: 'template' } {
  if (!data || typeof data !== 'object') {
    return false;
  }

  return (data as { kind?: unknown }).kind === 'template';
}

// ============================================================================
// Type Exports
// ============================================================================

export type InferredDesignTemplate = z.infer<typeof designTemplateSchema>;
export type InferredTemplateMetadata = z.infer<typeof templateMetadataSchema>;
