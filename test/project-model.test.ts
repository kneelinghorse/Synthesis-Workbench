import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';

import { saveDesign, designExists } from '../src/lib/persistence/design-store';
import {
  buildLegacyDesignMigrationPlan,
  migrateLegacyDesignsToProject,
} from '../src/lib/persistence/project-migration';
import {
  PROJECTS_DIR,
  describeProjectLayout,
  getProjectDesignPath,
  getProjectManifestPath,
} from '../src/lib/persistence/project-layout';
import { parseProjectManifest } from '../src/types/project-model.schema';
import type { DesignDocument } from '../src/types/document-model';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-project-model-tmp');

const sampleDocument = (title: string): DesignDocument => ({
  metadata: {
    title,
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
        id: 'c-1',
        ref: 'oods:Card',
        props: {
          title,
        },
      },
    ],
  },
});

const cleanupTestDir = async () => {
  await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
};

describe('Project Layout', () => {
  it('describes canonical project paths', () => {
    const layout = describeProjectLayout('alpha', TEST_BASE_DIR);
    expect(layout.rootDir).toBe(path.join(TEST_BASE_DIR, PROJECTS_DIR));
    expect(layout.manifestPath).toBe(
      path.join(TEST_BASE_DIR, 'projects', 'alpha', 'project.yaml')
    );
    expect(layout.tokensPath).toBe(
      path.join(TEST_BASE_DIR, 'projects', 'alpha', 'state', 'tokens.yaml')
    );
  });

  it('builds project-scoped design path', () => {
    expect(getProjectDesignPath('alpha', 'home', TEST_BASE_DIR)).toBe(
      path.join(
        TEST_BASE_DIR,
        'projects',
        'alpha',
        'designs',
        'home.design.yaml'
      )
    );
  });
});

describe('Legacy Design Migration Plan', () => {
  beforeEach(async () => {
    await cleanupTestDir();
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  it('maps legacy ./designs files into project layout steps', async () => {
    await saveDesign('home', sampleDocument('Home'), TEST_BASE_DIR);
    await saveDesign('settings', sampleDocument('Settings'), TEST_BASE_DIR);

    const plan = await buildLegacyDesignMigrationPlan({
      projectSlug: 'demo',
      projectName: 'Demo',
      baseDir: TEST_BASE_DIR,
      now: '2026-02-15T00:00:00.000Z',
    });

    expect(plan.projectSlug).toBe('demo');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.targetPath).toContain(
      path.join('projects', 'demo', 'designs')
    );
    expect(plan.notes.length).toBeGreaterThan(0);
  });

  it('executes migration and writes project manifest + state files', async () => {
    await saveDesign('home', sampleDocument('Home'), TEST_BASE_DIR);

    const result = await migrateLegacyDesignsToProject({
      projectSlug: 'workspace',
      projectName: 'Workspace',
      baseDir: TEST_BASE_DIR,
      now: '2026-02-15T00:00:00.000Z',
    });

    const manifestPath = getProjectManifestPath('workspace', TEST_BASE_DIR);
    const manifestYaml = await fs.readFile(manifestPath, 'utf-8');
    const parsedManifest = parseProjectManifest(yaml.load(manifestYaml));

    expect(result.dryRun).toBe(false);
    expect(result.copied).toHaveLength(1);
    expect(parsedManifest.metadata.slug).toBe('workspace');
    expect(parsedManifest.relationships.designs).toHaveLength(1);
    expect(parsedManifest.activeDesignSlug).toBe('home');

    const migratedExists = await designExists(
      'home',
      path.join(TEST_BASE_DIR, 'projects', 'workspace')
    );
    expect(migratedExists).toBe(true);

    const legacyStillExists = await designExists('home', TEST_BASE_DIR);
    expect(legacyStillExists).toBe(true);
  });

  it('supports dry-run migration without filesystem writes', async () => {
    await saveDesign('home', sampleDocument('Home'), TEST_BASE_DIR);

    const result = await migrateLegacyDesignsToProject({
      projectSlug: 'dryrun',
      projectName: 'Dry Run',
      baseDir: TEST_BASE_DIR,
      dryRun: true,
      now: '2026-02-15T00:00:00.000Z',
    });

    expect(result.dryRun).toBe(true);
    expect(result.copied).toHaveLength(0);

    await expect(
      fs.access(getProjectManifestPath('dryrun', TEST_BASE_DIR))
    ).rejects.toBeDefined();
  });
});
