import type { DesignDocument } from '@/types/document-model';
import type { DesignTemplate } from '@/types/template-model';
import { parseDesignTemplate } from '@/types/template-model.schema';

export type ApplyTemplateOptions = {
  title?: string;
  description?: string;
  data?: Record<string, unknown>;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function applyTemplate(
  templateInput: DesignTemplate,
  options?: ApplyTemplateOptions
): DesignDocument {
  const template = parseDesignTemplate(templateInput);
  const now = new Date().toISOString();
  const document = deepClone(template.document);

  document.metadata = {
    ...document.metadata,
    title: options?.title ?? document.metadata.title ?? template.metadata.name,
    description:
      options?.description ??
      document.metadata.description ??
      template.metadata.description,
    createdAt: now,
    updatedAt: now,
  };

  if (options?.data) {
    document.data = deepClone(options.data);
  }

  return document;
}
