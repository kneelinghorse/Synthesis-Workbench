import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

import {
  clearProjectBundleAssociation,
  loadProjectBundleAssociation,
  saveProjectBundleAssociation,
} from '../src/lib/persistence/project-bundle-store';
import { DASHBOARD_BUNDLE } from './fixtures/stage1-bundle';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-project-bundle-association-tmp');

describe('project bundle association persistence', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  it('stores and reloads associated Stage1 run metadata + bundle payload', async () => {
    await saveProjectBundleAssociation(
      'workspace',
      {
        sourceRun: {
          runId: 'run-42',
          hostname: 'example.com',
          timestamp: '2026-02-15T00:00:00.000Z',
          bundlePath: '/tmp/out/stage1/example.com/run-42',
        },
        bundle: DASHBOARD_BUNDLE,
      },
      TEST_BASE_DIR
    );

    const loaded = await loadProjectBundleAssociation('workspace', TEST_BASE_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded?.sourceRun.runId).toBe('run-42');
    expect(loaded?.sourceRun.hostname).toBe('example.com');
    expect(loaded?.sourceRun.capturedAt).toBe('2026-02-15T00:00:00.000Z');
    expect((loaded?.bundle as any)?.manifest?.contractVersion).toBe('1.0.0');
  });

  it('clears persisted association', async () => {
    await saveProjectBundleAssociation(
      'workspace',
      {
        sourceRun: { runId: 'run-42' },
        bundle: DASHBOARD_BUNDLE,
      },
      TEST_BASE_DIR
    );

    await clearProjectBundleAssociation('workspace', TEST_BASE_DIR);
    const loaded = await loadProjectBundleAssociation('workspace', TEST_BASE_DIR);
    expect(loaded).toBeNull();
  });
});
