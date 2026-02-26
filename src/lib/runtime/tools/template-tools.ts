import { useDocumentStateStore } from '@/lib/stores/document-state';
import type { TemplateCategory } from '@/types/template-model';
import type { TemplateDataShape, TemplateTokenOverrides } from '@/types/template-model';
import type { DesignNode } from '@/types/document-model';

export const SAVE_TEMPLATE_TOOL_NAME = 'save_template';

export type SaveTemplateToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  slug?: string;
  name: string;
  description: string;
  category: TemplateCategory;
  previewThumbnail?: string;
  tags?: string[];
  tokenOverrides?: TemplateTokenOverrides;
  dataShape?: TemplateDataShape;
};

export type SaveTemplateToolResult = {
  saved: boolean;
  slug?: string;
  source?: 'custom';
  nodeCount: number;
  componentCount: number;
  requiredComponents: string[];
  errors?: string[];
  resolvedAt: string;
};

const countNodes = (node: DesignNode): number => {
  if (node.nodeType === 'component') {
    return 1;
  }
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
};

const countComponents = (node: DesignNode): number => {
  if (node.nodeType === 'component') {
    return 1;
  }
  return node.children.reduce((sum, child) => sum + countComponents(child), 0);
};

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // No-op fallback below.
  }

  return `Template save failed with status ${response.status}.`;
};

export async function executeSaveTemplate(
  args: SaveTemplateToolArgs
): Promise<SaveTemplateToolResult> {
  const document = useDocumentStateStore.getState().document;
  if (!document) {
    return {
      saved: false,
      nodeCount: 0,
      componentCount: 0,
      requiredComponents: [],
      errors: ['No active document. Use /doc to set a document first.'],
      resolvedAt: new Date().toISOString(),
    };
  }

  const nodeCount = countNodes(document.root);
  const componentCount = countComponents(document.root);

  try {
    const response = await fetch('/api/templates', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: args.slug,
        name: args.name,
        description: args.description,
        category: args.category,
        previewThumbnail: args.previewThumbnail,
        tags: args.tags,
        tokenOverrides: args.tokenOverrides,
        dataShape: args.dataShape,
        document,
      }),
    });

    if (!response.ok) {
      const errorMessage = await parseErrorMessage(response);
      return {
        saved: false,
        nodeCount,
        componentCount,
        requiredComponents: [],
        errors: [errorMessage],
        resolvedAt: new Date().toISOString(),
      };
    }

    const payload = (await response.json()) as {
      saved: boolean;
      slug: string;
      source: 'custom';
      requiredComponents?: string[];
    };

    return {
      saved: payload.saved,
      slug: payload.slug,
      source: payload.source,
      nodeCount,
      componentCount,
      requiredComponents: payload.requiredComponents ?? [],
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      saved: false,
      nodeCount,
      componentCount,
      requiredComponents: [],
      errors: [
        error instanceof Error ? error.message : 'Unknown template save failure.',
      ],
      resolvedAt: new Date().toISOString(),
    };
  }
}
