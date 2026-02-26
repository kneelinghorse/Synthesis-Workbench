/**
 * Template Persistence Utilities
 *
 * Defines file-system conventions and YAML serialization/parsing helpers for
 * reusable templates. Template payloads are distinct from design instances.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { isValidSlug } from '@/lib/persistence/design-store';
import type { DesignTemplate } from '@/types/template-model';
import { parseDesignTemplate } from '@/types/template-model.schema';

/**
 * Base directory for template files (relative to project root).
 */
export const TEMPLATES_DIR = 'templates';

/**
 * Template file extension.
 */
export const TEMPLATE_EXTENSION = '.template.yaml';

/**
 * Get absolute path to templates directory.
 */
export function getTemplatesDir(baseDir?: string): string {
  const base = baseDir || process.cwd();
  return path.join(base, TEMPLATES_DIR);
}

/**
 * Get absolute path to a template file.
 */
export function getTemplateFilePath(slug: string, baseDir?: string): string {
  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid template slug: ${slug}. Must contain only alphanumeric characters, hyphens, and underscores.`
    );
  }

  const templatesDir = getTemplatesDir(baseDir);
  return path.join(templatesDir, `${slug}${TEMPLATE_EXTENSION}`);
}

/**
 * Parse template slug from full file path.
 */
export function templateSlugFromPath(filePath: string): string {
  return path.basename(filePath, TEMPLATE_EXTENSION);
}

/**
 * Convert DesignTemplate to YAML string.
 */
export function toTemplateYAML(template: DesignTemplate): string {
  const validated = parseDesignTemplate(template);

  return yaml.dump(validated, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

/**
 * Parse DesignTemplate from YAML string.
 */
export function fromTemplateYAML(yamlString: string): DesignTemplate {
  const parsed = yaml.load(yamlString);
  return parseDesignTemplate(parsed);
}

export type CustomTemplateRecord = {
  slug: string;
  filePath: string;
  template: DesignTemplate;
};

/**
 * Load a custom template from disk.
 */
export async function loadTemplate(
  slug: string,
  baseDir?: string
): Promise<DesignTemplate> {
  const filePath = getTemplateFilePath(slug, baseDir);

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return fromTemplateYAML(fileContent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Template not found: ${slug}`);
    }
    throw new Error(`Failed to load template: ${(error as Error).message}`);
  }
}

/**
 * Save a custom template to disk.
 */
export async function saveTemplate(
  slug: string,
  template: DesignTemplate,
  baseDir?: string
): Promise<void> {
  const filePath = getTemplateFilePath(slug, baseDir);
  const templatesDir = getTemplatesDir(baseDir);

  try {
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(filePath, toTemplateYAML(template), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save template: ${(error as Error).message}`);
  }
}

/**
 * Check whether a custom template already exists on disk.
 */
export async function templateExists(
  slug: string,
  baseDir?: string
): Promise<boolean> {
  const filePath = getTemplateFilePath(slug, baseDir);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all custom templates stored on disk.
 */
export async function listCustomTemplates(
  baseDir?: string
): Promise<CustomTemplateRecord[]> {
  const templatesDir = getTemplatesDir(baseDir);

  try {
    const files = await fs.readdir(templatesDir);
    const templates: CustomTemplateRecord[] = [];

    for (const file of files) {
      if (!file.endsWith(TEMPLATE_EXTENSION)) {
        continue;
      }

      const filePath = path.join(templatesDir, file);
      const slug = templateSlugFromPath(filePath);

      try {
        const template = await loadTemplate(slug, baseDir);
        templates.push({ slug, filePath, template });
      } catch (error) {
        console.warn(`Skipping invalid template: ${file}`, error);
      }
    }

    return templates.sort((a, b) => {
      const aUpdated = a.template.metadata.updatedAt ?? '';
      const bUpdated = b.template.metadata.updatedAt ?? '';
      if (aUpdated && bUpdated) {
        return bUpdated.localeCompare(aUpdated);
      }

      return a.slug.localeCompare(b.slug);
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw new Error(`Failed to list templates: ${(error as Error).message}`);
  }
}
