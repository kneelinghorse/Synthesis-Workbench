import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

import type { DesignDocument } from '@/types/document-model';
import type { DesignTemplate } from '@/types/template-model';
import { fromYAML as fromDesignYAML, toYAML as toDesignYAML } from './design-store';
import {
  fromTemplateYAML,
  listCustomTemplates,
  loadTemplate,
  saveTemplate,
  templateExists,
  toTemplateYAML,
} from './template-store';

const makeDocument = (): DesignDocument => ({
  metadata: {
    title: 'Landing Starter',
    description: 'Reusable landing page starter',
  },
  root: {
    nodeType: 'layout',
    layout: {
      type: 'stack',
      gap: 24,
    },
    children: [
      {
        nodeType: 'component',
        id: 'hero-heading',
        ref: 'oods:Text',
        props: {
          text: 'Welcome',
        },
      },
      {
        nodeType: 'component',
        id: 'hero-cta',
        ref: 'oods:Button',
        props: {
          label: 'Get Started',
        },
      },
    ],
  },
});

const makeTemplate = (): DesignTemplate => ({
  kind: 'template',
  metadata: {
    name: 'Landing Starter',
    description: 'Reusable landing page starter',
    category: 'landing',
    previewThumbnail: '/thumbnails/landing-starter.png',
  },
  document: makeDocument(),
  tokenOverrides: {
    'colors.primary': '#112233',
  },
  dataShape: {
    hero: {
      type: 'object',
      required: true,
    },
  },
  requiredComponents: ['oods:Text', 'oods:Button'],
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-template-store-tmp');
const PREVIOUS_CWD = process.cwd();

describe('template-store', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    process.chdir(TEST_BASE_DIR);
  });

  afterEach(async () => {
    process.chdir(PREVIOUS_CWD);
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  it('serializes and parses template YAML round-trip', () => {
    const yaml = toTemplateYAML(makeTemplate());
    const parsed = fromTemplateYAML(yaml);

    expect(yaml).toContain('kind: template');
    expect(yaml).toContain('requiredComponents:');
    expect(parsed.metadata.name).toBe('Landing Starter');
    expect(parsed.requiredComponents).toEqual(['oods:Text', 'oods:Button']);
  });

  it('rejects design YAML when parsing as template', () => {
    const designYaml = toDesignYAML(makeDocument());

    expect(() => fromTemplateYAML(designYaml)).toThrow();
  });

  it('rejects template YAML when parsing as design instance', () => {
    const templateYaml = toTemplateYAML(makeTemplate());

    expect(() => fromDesignYAML(templateYaml)).toThrow(
      'Template YAML cannot be parsed as a DesignDocument instance'
    );
  });

  it('saves and loads a custom template file', async () => {
    const template = makeTemplate();
    await saveTemplate('landing-starter', template, TEST_BASE_DIR);

    const exists = await templateExists('landing-starter', TEST_BASE_DIR);
    expect(exists).toBe(true);

    const loaded = await loadTemplate('landing-starter', TEST_BASE_DIR);
    expect(loaded.metadata.name).toBe('Landing Starter');
    expect(loaded.requiredComponents).toEqual(['oods:Text', 'oods:Button']);
  });

  it('lists custom templates from disk', async () => {
    await saveTemplate('landing-starter', makeTemplate(), TEST_BASE_DIR);
    await saveTemplate(
      'landing-secondary',
      {
        ...makeTemplate(),
        metadata: {
          ...makeTemplate().metadata,
          name: 'Landing Secondary',
        },
      },
      TEST_BASE_DIR
    );

    const templates = await listCustomTemplates(TEST_BASE_DIR);
    expect(templates).toHaveLength(2);
    expect(templates.map((entry) => entry.slug).sort()).toEqual([
      'landing-secondary',
      'landing-starter',
    ]);
  });
});
