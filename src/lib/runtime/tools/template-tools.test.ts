import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentStateStore } from '@/lib/stores/document-state';
import type { DesignDocument } from '@/types/document-model';
import { executeSaveTemplate } from './template-tools';

const SAMPLE_DOCUMENT: DesignDocument = {
  metadata: { title: 'Ops Dashboard' },
  root: {
    nodeType: 'layout',
    layout: { type: 'stack', gap: 12 },
    children: [
      {
        nodeType: 'component',
        id: 'nav-1',
        ref: 'oods:Tabs',
        props: {},
      },
      {
        nodeType: 'component',
        id: 'card-1',
        ref: 'oods:Card',
        props: {},
      },
    ],
  },
};

describe('template-tools', () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an error when no active document exists', async () => {
    const result = await executeSaveTemplate({
      requestId: 'template-save-1',
      name: 'Ops Dashboard',
      description: 'Ops starter',
      category: 'dashboard',
    });

    expect(result.saved).toBe(false);
    expect(result.errors?.[0]).toContain('No active document');
  });

  it('posts active document payload to /api/templates and returns success data', async () => {
    useDocumentStateStore.getState().setDocument(SAMPLE_DOCUMENT);

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          saved: true,
          slug: 'ops-dashboard',
          source: 'custom',
          requiredComponents: ['oods:Tabs', 'oods:Card'],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeSaveTemplate({
      requestId: 'template-save-2',
      name: 'Ops Dashboard',
      description: 'Ops starter',
      category: 'dashboard',
      slug: 'ops-dashboard',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.saved).toBe(true);
    expect(result.slug).toBe('ops-dashboard');
    expect(result.requiredComponents).toEqual([
      'oods:Tabs',
      'oods:Card',
    ]);
    expect(result.nodeCount).toBeGreaterThan(0);
    expect(result.componentCount).toBeGreaterThan(0);
  });
});
