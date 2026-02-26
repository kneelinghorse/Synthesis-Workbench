/**
 * Template Model for Synthesis Workbench
 *
 * Templates are reusable blueprints that package:
 * - A DesignDocument skeleton
 * - Optional token overrides
 * - Expected data shape hints
 * - Required OODS component references
 * - Template metadata for discovery/preview
 */

import type { DesignDocument } from './document-model';

/**
 * Supported template categories.
 * Can be extended as new built-in patterns are added.
 */
export const TEMPLATE_CATEGORIES = [
  'dashboard',
  'form',
  'landing',
  'settings',
  'detail',
  'other',
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * Supported data field type hints for template data shape.
 */
export const TEMPLATE_DATA_TYPES = [
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'unknown',
] as const;

export type TemplateDataType = (typeof TEMPLATE_DATA_TYPES)[number];

/**
 * Metadata shown in template pickers and browser UIs.
 */
export interface TemplateMetadata {
  name: string;
  description: string;
  category: TemplateCategory;
  previewThumbnail?: string;
  tags?: string[];
  author?: string;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Expected shape for runtime data bound into the template.
 */
export interface TemplateDataField {
  type: TemplateDataType;
  required?: boolean;
  description?: string;
  example?: unknown;
}

export type TemplateDataShape = Record<string, TemplateDataField>;

/**
 * Token path -> value map used as initial overrides when applying template.
 */
export type TemplateTokenOverrides = Record<string, unknown>;

/**
 * Reusable template file payload.
 *
 * Distinction from DesignDocument:
 * - DesignDocument is an instance to edit/render.
 * - DesignTemplate is a reusable starter definition.
 */
export interface DesignTemplate {
  kind: 'template';
  metadata: TemplateMetadata;
  document: DesignDocument;
  tokenOverrides?: TemplateTokenOverrides;
  dataShape?: TemplateDataShape;
  requiredComponents?: string[];
}
