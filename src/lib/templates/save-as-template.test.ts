import { describe, expect, it } from 'vitest';

import type { DesignDocument } from '@/types/document-model';
import { createTemplateFromDesign, toTemplateSlug } from './save-as-template';

const SAMPLE_DOCUMENT: DesignDocument = {
  metadata: {
    title: 'Revenue Dashboard',
    description: 'Instance-specific dashboard',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
  },
  root: {
    nodeType: 'layout',
    layout: { type: 'stack', gap: 16 },
    children: [
      {
        nodeType: 'component',
        id: 'nav',
        ref: 'oods:Tabs',
        props: {},
      },
      {
        nodeType: 'component',
        id: 'card-1',
        ref: 'oods:Card',
        props: {},
      },
      {
        nodeType: 'component',
        id: 'card-2',
        ref: 'oods:Card',
        props: {},
      },
    ],
  },
  data: {
    user: { id: 'u-1' },
  },
};

describe('save-as-template', () => {
  it('creates a reusable template and strips instance data', () => {
    const template = createTemplateFromDesign(SAMPLE_DOCUMENT, {
      name: 'Ops Dashboard',
      description: 'Reusable dashboard starter',
      category: 'dashboard',
    });

    expect(template.kind).toBe('template');
    expect(template.metadata.name).toBe('Ops Dashboard');
    expect(template.document.data).toBeUndefined();
    expect(template.document.metadata.createdAt).toBeUndefined();
    expect(template.document.metadata.updatedAt).toBeUndefined();
    expect(template.document.metadata.title).toBe('Ops Dashboard');
  });

  it('preserves layout/component structure and extracts unique required components', () => {
    const template = createTemplateFromDesign(SAMPLE_DOCUMENT, {
      name: 'Ops Dashboard',
      description: 'Reusable dashboard starter',
      category: 'dashboard',
    });

    expect(template.document.root.nodeType).toBe('layout');
    expect(template.requiredComponents).toEqual([
      'oods:Tabs',
      'oods:Card',
    ]);
  });

  it('derives slug-safe names', () => {
    expect(toTemplateSlug(' Ops Dashboard ')).toBe('ops-dashboard');
    expect(toTemplateSlug('My@Template#1')).toBe('my-template-1');
  });
});
