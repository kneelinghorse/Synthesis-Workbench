/**
 * Client-safe Design Document Serialization
 *
 * Pure serialization functions (no fs, no Node APIs).
 * Safe to import from client components and shared modules.
 */

import * as yaml from 'js-yaml';
import type { DesignDocument } from '@/types/document-model';
import { parseDesignDocument } from '@/types/document-model.schema';
import { isTemplateFilePayload } from '@/types/template-model.schema';

function assertDesignInstancePayload(data: unknown): void {
  if (isTemplateFilePayload(data)) {
    throw new Error(
      'Template YAML cannot be parsed as a DesignDocument instance. Use template parsing utilities instead.'
    );
  }
}

/**
 * Convert DesignDocument to JSON string
 */
export function toJSON(document: DesignDocument): string {
  return JSON.stringify(document, null, 2);
}

/**
 * Parse DesignDocument from JSON string
 */
export function fromJSON(json: string): DesignDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Invalid design JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return parseDesignDocument(parsed);
}

/**
 * Convert DesignDocument to YAML string
 */
export function toYAML(document: DesignDocument): string {
  return yaml.dump(document, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

/**
 * Parse DesignDocument from YAML string
 */
export function fromYAML(yamlString: string): DesignDocument {
  const parsed = yaml.load(yamlString);
  assertDesignInstancePayload(parsed);
  return parseDesignDocument(parsed);
}
