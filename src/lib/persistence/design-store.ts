/**
 * Design Document Persistence Layer
 *
 * Handles storage and retrieval of design documents.
 * - YAML for storage (human-friendly, good git diffs)
 * - JSON as interchange format
 * - Files stored in ./designs/{slug}.design.yaml
 * - No custom versioning (relies on git)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { DesignDocument, DocumentMetadata } from '@/types/document-model';
import { parseDesignDocument } from '@/types/document-model.schema';
import { isTemplateFilePayload } from '@/types/template-model.schema';

// Re-export client-safe serialization functions for backwards compatibility
export { toJSON, fromJSON, toYAML, fromYAML } from './design-serialization';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Base directory for design files (relative to project root)
 */
export const DESIGNS_DIR = 'designs';

/**
 * Template file name
 */
export const TEMPLATE_FILE = '_template.design.yaml';

/**
 * Design file extension
 */
export const DESIGN_EXTENSION = '.design.yaml';

// ============================================================================
// Types
// ============================================================================

/**
 * Design metadata for listing
 */
export interface DesignMeta {
  slug: string;
  title?: string;
  description?: string;
  author?: string;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  filePath: string;
}

/**
 * Result of a design operation
 */
export interface DesignResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function assertDesignInstancePayload(data: unknown): void {
  if (isTemplateFilePayload(data)) {
    throw new Error(
      'Template YAML cannot be parsed as a DesignDocument instance. Use template parsing utilities instead.'
    );
  }
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get absolute path to designs directory
 */
export function getDesignsDir(baseDir?: string): string {
  const base = baseDir || process.cwd();
  return path.join(base, DESIGNS_DIR);
}

/**
 * Get absolute path to a design file
 */
export function getDesignPath(slug: string, baseDir?: string): string {
  const designsDir = getDesignsDir(baseDir);
  return path.join(designsDir, `${slug}${DESIGN_EXTENSION}`);
}

/**
 * Get template file path
 */
export function getTemplatePath(baseDir?: string): string {
  const designsDir = getDesignsDir(baseDir);
  return path.join(designsDir, TEMPLATE_FILE);
}

/**
 * Extract slug from file path
 */
export function slugFromPath(filePath: string): string {
  const basename = path.basename(filePath, DESIGN_EXTENSION);
  return basename;
}

/**
 * Validate slug format (alphanumeric + hyphens + underscores)
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9_-]+$/i.test(slug);
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Load a design document from YAML file
 *
 * @param slug - Design slug (filename without extension)
 * @param baseDir - Optional base directory (defaults to cwd)
 * @returns Validated DesignDocument
 */
export async function loadDesign(
  slug: string,
  baseDir?: string
): Promise<DesignDocument> {
  const filePath = getDesignPath(slug, baseDir);

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(fileContent);
    assertDesignInstancePayload(parsed);

    // Validate against schema
    const document = parseDesignDocument(parsed);

    return document;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Design not found: ${slug}`);
    }
    throw new Error(`Failed to load design: ${(error as Error).message}`);
  }
}

/**
 * Save a design document to YAML file
 *
 * @param slug - Design slug (filename without extension)
 * @param document - DesignDocument to save
 * @param baseDir - Optional base directory (defaults to cwd)
 */
export async function saveDesign(
  slug: string,
  document: DesignDocument,
  baseDir?: string
): Promise<void> {
  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid slug: ${slug}. Must contain only alphanumeric characters, hyphens, and underscores.`
    );
  }

  const filePath = getDesignPath(slug, baseDir);

  try {
    // Ensure designs directory exists
    const designsDir = getDesignsDir(baseDir);
    await fs.mkdir(designsDir, { recursive: true });

    // Update timestamp
    const updatedDoc = {
      ...document,
      metadata: {
        ...document.metadata,
        updatedAt: new Date().toISOString(),
      },
    };

    // Serialize to YAML with proper formatting
    const yamlContent = yaml.dump(updatedDoc, {
      indent: 2,
      lineWidth: -1, // No line wrapping
      noRefs: true, // No YAML references
      sortKeys: false, // Preserve key order
    });

    // Write to file
    await fs.writeFile(filePath, yamlContent, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save design: ${(error as Error).message}`);
  }
}

/**
 * List all available designs with metadata
 *
 * @param baseDir - Optional base directory (defaults to cwd)
 * @returns Array of design metadata
 */
export async function listDesigns(baseDir?: string): Promise<DesignMeta[]> {
  const designsDir = getDesignsDir(baseDir);

  try {
    const files = await fs.readdir(designsDir);

    const designs: DesignMeta[] = [];

    for (const file of files) {
      // Skip non-design files
      if (!file.endsWith(DESIGN_EXTENSION)) {
        continue;
      }

      // Skip template
      if (file === TEMPLATE_FILE) {
        continue;
      }

      const slug = slugFromPath(file);
      const filePath = path.join(designsDir, file);

      try {
        // Load document to extract metadata
        const document = await loadDesign(slug, baseDir);

        designs.push({
          slug,
          ...document.metadata,
          filePath,
        });
      } catch (error) {
        // Skip invalid designs but don't fail the whole operation
        console.warn(`Skipping invalid design: ${file}`, error);
      }
    }

    return designs.sort((a, b) => {
      // Sort by updatedAt desc, then createdAt desc, then slug asc
      if (a.updatedAt && b.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      if (a.createdAt && b.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return a.slug.localeCompare(b.slug);
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Designs directory doesn't exist yet
      return [];
    }
    throw new Error(`Failed to list designs: ${(error as Error).message}`);
  }
}

/**
 * Create a new design from template
 *
 * @param slug - Design slug (filename without extension)
 * @param metadata - Optional metadata overrides
 * @param baseDir - Optional base directory (defaults to cwd)
 * @returns Created DesignDocument
 */
export async function createDesign(
  slug: string,
  metadata?: Partial<DocumentMetadata>,
  baseDir?: string
): Promise<DesignDocument> {
  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid slug: ${slug}. Must contain only alphanumeric characters, hyphens, and underscores.`
    );
  }

  // Check if design already exists
  const filePath = getDesignPath(slug, baseDir);
  try {
    await fs.access(filePath);
    throw new Error(`Design already exists: ${slug}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist, proceed with creation
  }

  try {
    // Load template
    const templatePath = getTemplatePath(baseDir);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = yaml.load(templateContent);
    const templateDoc = parseDesignDocument(template);

    // Create new document with metadata overrides
    const now = new Date().toISOString();
    const newDoc: DesignDocument = {
      ...templateDoc,
      metadata: {
        ...templateDoc.metadata,
        ...metadata,
        createdAt: now,
        updatedAt: now,
      },
    };

    // Save the new design
    await saveDesign(slug, newDoc, baseDir);

    return newDoc;
  } catch (error) {
    throw new Error(`Failed to create design: ${(error as Error).message}`);
  }
}

/**
 * Delete a design
 *
 * @param slug - Design slug (filename without extension)
 * @param baseDir - Optional base directory (defaults to cwd)
 */
export async function deleteDesign(
  slug: string,
  baseDir?: string
): Promise<void> {
  const filePath = getDesignPath(slug, baseDir);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Design not found: ${slug}`);
    }
    throw new Error(`Failed to delete design: ${(error as Error).message}`);
  }
}

/**
 * Check if a design exists
 *
 * @param slug - Design slug (filename without extension)
 * @param baseDir - Optional base directory (defaults to cwd)
 * @returns True if design exists
 */
export async function designExists(
  slug: string,
  baseDir?: string
): Promise<boolean> {
  const filePath = getDesignPath(slug, baseDir);

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// JSON Interchange
// ============================================================================
// Pure serialization functions (toJSON, fromJSON, toYAML, fromYAML) live in
// ./design-serialization.ts to avoid pulling fs/promises into client bundles.
// They are re-exported from this module for backwards compatibility.
