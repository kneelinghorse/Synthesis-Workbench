import { listCustomTemplates } from '@/lib/persistence/template-store';
import {
  BUILT_IN_TEMPLATE_SLUGS,
  getBuiltInTemplate,
} from '@/lib/templates/built-in-library';

export type TemplateCatalogEntry = {
  source: 'built-in' | 'custom';
  slug: string;
  name: string;
  description: string;
  category: string;
  previewThumbnail?: string;
  requiredComponents: string[];
  updatedAt?: string;
};

export async function listTemplateCatalog(
  baseDir?: string
): Promise<TemplateCatalogEntry[]> {
  const builtInEntries: TemplateCatalogEntry[] = BUILT_IN_TEMPLATE_SLUGS.map(
    (slug) => {
      const template = getBuiltInTemplate(slug);
      return {
        source: 'built-in',
        slug,
        name: template.metadata.name,
        description: template.metadata.description,
        category: template.metadata.category,
        previewThumbnail: template.metadata.previewThumbnail,
        requiredComponents: [...(template.requiredComponents ?? [])],
        updatedAt: template.metadata.updatedAt,
      };
    }
  );

  const customEntries = await listCustomTemplates(baseDir);
  const customMapped: TemplateCatalogEntry[] = customEntries.map((entry) => ({
    source: 'custom',
    slug: entry.slug,
    name: entry.template.metadata.name,
    description: entry.template.metadata.description,
    category: entry.template.metadata.category,
    previewThumbnail: entry.template.metadata.previewThumbnail,
    requiredComponents: [...(entry.template.requiredComponents ?? [])],
    updatedAt: entry.template.metadata.updatedAt,
  }));

  return [...builtInEntries, ...customMapped];
}
