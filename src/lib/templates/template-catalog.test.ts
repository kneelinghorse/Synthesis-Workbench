import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

import { saveTemplate } from '@/lib/persistence/template-store';
import type { DesignTemplate } from '@/types/template-model';
import { listTemplateCatalog } from './template-catalog';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-template-catalog-tmp');
const PREVIOUS_CWD = process.cwd();

const CUSTOM_TEMPLATE: DesignTemplate = {
  kind: 'template',
  metadata: {
    name: 'Custom Ops',
    description: 'Custom ops starter',
    category: 'dashboard',
  },
  document: {
    metadata: {
      title: 'Custom Ops',
    },
    root: {
      nodeType: 'component',
      id: 'custom-card',
      ref: 'oods:Card',
      props: {},
    },
  },
  requiredComponents: ['oods:Card'],
};

describe('template-catalog', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    process.chdir(TEST_BASE_DIR);
  });

  afterEach(async () => {
    process.chdir(PREVIOUS_CWD);
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  it('returns built-in templates and custom templates together', async () => {
    await saveTemplate('custom-ops', CUSTOM_TEMPLATE, TEST_BASE_DIR);

    const entries = await listTemplateCatalog(TEST_BASE_DIR);
    expect(entries.length).toBeGreaterThanOrEqual(6);

    const builtIn = entries.find(
      (entry) => entry.source === 'built-in' && entry.slug === 'dashboard'
    );
    const custom = entries.find(
      (entry) => entry.source === 'custom' && entry.slug === 'custom-ops'
    );

    expect(builtIn).toBeDefined();
    expect(custom).toBeDefined();
    expect(custom?.name).toBe('Custom Ops');
  });
});
