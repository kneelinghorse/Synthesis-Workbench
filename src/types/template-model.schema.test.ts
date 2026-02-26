import { describe, expect, it } from 'vitest';

import type { DesignDocument } from './document-model';
import type { DesignTemplate } from './template-model';
import { parseDesignDocument } from './document-model.schema';
import {
  parseDesignTemplate,
  safeParseDesignTemplate,
} from './template-model.schema';

const makeDocument = (): DesignDocument => ({
  metadata: {
    title: 'Dashboard Starter',
    description: 'Reusable dashboard scaffold',
  },
  root: {
    nodeType: 'layout',
    layout: {
      type: 'stack',
      gap: 16,
    },
    children: [
      {
        nodeType: 'component',
        id: 'card-1',
        ref: 'oods:Card',
        props: {
          title: 'KPI',
        },
      },
      {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:Button',
        props: {
          label: 'Refresh',
        },
      },
    ],
  },
});

const makeTemplate = (): DesignTemplate => ({
  kind: 'template',
  metadata: {
    name: 'Dashboard Starter',
    description: 'Reusable dashboard scaffold',
    category: 'dashboard',
    previewThumbnail: '/thumbnails/dashboard-starter.png',
  },
  document: makeDocument(),
  tokenOverrides: {
    'colors.primary': '#0055ff',
    'spacing.md': '1rem',
  },
  dataShape: {
    user: {
      type: 'object',
      required: true,
      description: 'Current user payload',
    },
    metrics: {
      type: 'array',
      required: true,
    },
  },
  requiredComponents: ['oods:Card', 'oods:Button'],
});

describe('parseDesignTemplate', () => {
  it('parses a valid template payload', () => {
    const parsed = parseDesignTemplate(makeTemplate());

    expect(parsed.kind).toBe('template');
    expect(parsed.metadata.category).toBe('dashboard');
    expect(parsed.requiredComponents).toEqual(['oods:Card', 'oods:Button']);
    expect(parsed.document.root.nodeType).toBe('layout');
  });

  it('rejects payloads that omit template kind', () => {
    const payload = makeTemplate() as unknown as Record<string, unknown>;
    delete payload.kind;

    const result = safeParseDesignTemplate(payload);
    expect(result.success).toBe(false);
  });

  it('rejects invalid required component refs', () => {
    const payload = makeTemplate();
    payload.requiredComponents = ['Button'];

    const result = safeParseDesignTemplate(payload);
    expect(result.success).toBe(false);
  });

  it('rejects required components that are not present in document', () => {
    const payload = makeTemplate();
    payload.requiredComponents = ['oods:Modal'];

    const result = safeParseDesignTemplate(payload);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate required component refs', () => {
    const payload = makeTemplate();
    payload.requiredComponents = ['oods:Card', 'oods:Card'];

    const result = safeParseDesignTemplate(payload);
    expect(result.success).toBe(false);
  });

  it('is distinct from DesignDocument instance parsing', () => {
    const template = makeTemplate();

    expect(() => parseDesignDocument(template as unknown)).toThrow();
  });
});
