import { describe, expect, it } from 'vitest';

import type { DesignNode } from '@/types/document-model';
import { parseDesignDocument } from '@/types/document-model.schema';
import {
  BUILT_IN_TEMPLATE_SLUGS,
  applyBuiltInTemplate,
  getBuiltInTemplate,
  listBuiltInTemplates,
  resolveBuiltInTemplateSlug,
} from './built-in-library';

const ALLOWED_TEMPLATE_COMPONENT_REFS = new Set([
  'oods:Button',
  'oods:Card',
  'oods:Stack',
  'oods:Text',
  'oods:Input',
  'oods:Select',
  'oods:Badge',
  'oods:Banner',
  'oods:Table',
  'oods:Tabs',
]);

const collectComponentRefs = (node: DesignNode, refs: Set<string>): void => {
  if (node.nodeType === 'component') {
    refs.add(node.ref);
    return;
  }

  for (const child of node.children) {
    collectComponentRefs(child, refs);
  }
};

describe('built-in template library', () => {
  it('exposes five built-in templates out of the box', () => {
    const templates = listBuiltInTemplates();

    expect(templates).toHaveLength(5);
    expect(templates.map((template) => template.slug)).toEqual([
      'dashboard',
      'form-page',
      'landing-page',
      'settings-panel',
      'detail-view',
    ]);
  });

  it('applies every built-in template into a valid DesignDocument', () => {
    for (const slug of BUILT_IN_TEMPLATE_SLUGS) {
      const document = applyBuiltInTemplate(slug);
      const parsed = parseDesignDocument(document);
      expect(parsed.metadata.title).toBeTruthy();

      const refs = new Set<string>();
      collectComponentRefs(parsed.root, refs);
      expect(refs.size).toBeGreaterThan(0);
    }
  });

  it('ensures required OODS components are present in each template document', () => {
    for (const slug of BUILT_IN_TEMPLATE_SLUGS) {
      const template = getBuiltInTemplate(slug);
      const refs = new Set<string>();
      collectComponentRefs(template.document.root, refs);

      for (const requiredRef of template.requiredComponents ?? []) {
        expect(refs.has(requiredRef)).toBe(true);
      }
    }
  });

  it('limits built-in template refs to the supported S44 registry components', () => {
    for (const slug of BUILT_IN_TEMPLATE_SLUGS) {
      const template = getBuiltInTemplate(slug);
      const refs = new Set<string>();
      collectComponentRefs(template.document.root, refs);

      for (const ref of refs) {
        expect(ALLOWED_TEMPLATE_COMPONENT_REFS.has(ref)).toBe(true);
      }

      for (const requiredRef of template.requiredComponents ?? []) {
        expect(ALLOWED_TEMPLATE_COMPONENT_REFS.has(requiredRef)).toBe(true);
      }
    }
  });

  it('supports slug aliases for quick application flows', () => {
    expect(resolveBuiltInTemplateSlug('dashboard')).toBe('dashboard');
    expect(resolveBuiltInTemplateSlug('form')).toBe('form-page');
    expect(resolveBuiltInTemplateSlug('landing page')).toBe('landing-page');
    expect(resolveBuiltInTemplateSlug('settings')).toBe('settings-panel');
    expect(resolveBuiltInTemplateSlug('detail')).toBe('detail-view');
    expect(resolveBuiltInTemplateSlug('unknown')).toBeNull();
  });

  it('applies metadata overrides without mutating source template', () => {
    const original = getBuiltInTemplate('dashboard');
    const applied = applyBuiltInTemplate('dashboard', {
      title: 'Custom Dashboard',
      description: 'Overridden description',
      data: { user: { id: 'u-1' } },
    });

    expect(applied.metadata.title).toBe('Custom Dashboard');
    expect(applied.metadata.description).toBe('Overridden description');
    expect(applied.data).toEqual({ user: { id: 'u-1' } });
    expect(original.document.metadata.title).toBe('Dashboard Starter');
    expect(original.document.data).toBeUndefined();
  });
});
