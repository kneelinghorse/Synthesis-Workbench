import type { DesignDocument, DesignNode } from '@/types/document-model';
import type {
  TemplateCategory,
  TemplateDataShape,
  TemplateMetadata,
  TemplateTokenOverrides,
} from '@/types/template-model';
import type { DesignTemplate } from '@/types/template-model';
import { parseDesignTemplate } from '@/types/template-model.schema';

export type SaveAsTemplateOptions = {
  name: string;
  description: string;
  category: TemplateCategory;
  previewThumbnail?: string;
  tags?: string[];
  tokenOverrides?: TemplateTokenOverrides;
  dataShape?: TemplateDataShape;
  author?: string;
  version?: string;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const collectComponentRefs = (node: DesignNode, refs: Set<string>): void => {
  if (node.nodeType === 'component') {
    refs.add(node.ref);
    return;
  }

  for (const child of node.children) {
    collectComponentRefs(child, refs);
  }
};

export function toTemplateSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert an instance document into a reusable template payload.
 *
 * Instance-specific data is stripped:
 * - inline `document.data`
 * - volatile metadata timestamps on nested document metadata
 */
export function createTemplateFromDesign(
  document: DesignDocument,
  options: SaveAsTemplateOptions
): DesignTemplate {
  const clonedDocument = deepClone(document);
  delete clonedDocument.data;

  const requiredComponents = new Set<string>();
  collectComponentRefs(clonedDocument.root, requiredComponents);

  const now = new Date().toISOString();
  const metadata: TemplateMetadata = {
    name: options.name,
    description: options.description,
    category: options.category,
    previewThumbnail: options.previewThumbnail,
    tags: options.tags,
    author: options.author,
    version: options.version,
    createdAt: now,
    updatedAt: now,
  };

  clonedDocument.metadata = {
    ...clonedDocument.metadata,
    title: options.name,
    description: options.description,
    createdAt: undefined,
    updatedAt: undefined,
  };

  return parseDesignTemplate({
    kind: 'template',
    metadata,
    document: clonedDocument,
    tokenOverrides: options.tokenOverrides,
    dataShape: options.dataShape,
    requiredComponents: [...requiredComponents],
  });
}
