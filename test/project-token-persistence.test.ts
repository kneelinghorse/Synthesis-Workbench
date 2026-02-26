import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

import { saveProjectDesign } from '../src/lib/persistence/project-design-store';
import {
  loadProjectTokenState,
  saveProjectTokenState,
} from '../src/lib/persistence/project-token-store';
import { saveProjectBundleAssociation } from '../src/lib/persistence/project-bundle-store';
import { restoreProjectDesignState } from '../src/lib/persistence/project-workbench-state';
import { useDataContextStore } from '../src/lib/stores/data-context';
import { useDocumentStateStore } from '../src/lib/stores/document-state';
import { resetStage1BundleStore, useStage1BundleStore } from '../src/lib/stores/stage1-bundle';
import { resetTokenState, useTokenStateStore } from '../src/lib/stores/token-state';
import type { DesignDocument } from '../src/types/document-model';
import { DEFAULT_TOKEN_STATE } from '../src/types/token-state';
import { DASHBOARD_BUNDLE } from './fixtures/stage1-bundle';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-project-token-persistence-tmp');

const SAMPLE_DOCUMENT: DesignDocument = {
  metadata: {
    title: 'Token Persistence Design',
  },
  root: {
    nodeType: 'layout',
    layout: {
      type: 'stack',
      gap: 12,
    },
    children: [
      {
        nodeType: 'component',
        id: 'hero',
        ref: 'oods:Card',
        props: {
          title: 'Hero',
        },
      },
    ],
  },
  data: {
    account: {
      name: 'Acme',
    },
  },
};

describe('project token persistence', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });

    useDocumentStateStore.getState().reset();
    useDataContextStore.getState().reset();
    resetStage1BundleStore();
    resetTokenState();
  });

  afterEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  it('saves and reloads token state per project/design with history', async () => {
    await saveProjectTokenState(
      'workspace',
      'home',
      {
        values: {
          ...DEFAULT_TOKEN_STATE,
          colors: {
            ...DEFAULT_TOKEN_STATE.colors,
            primary: '#111111',
          },
          custom: {
            ...DEFAULT_TOKEN_STATE.custom,
            'banner.gradient': 'linear-gradient(#111,#222)',
          },
        },
        changes: {
          'colors.primary': {
            from: DEFAULT_TOKEN_STATE.colors.primary,
            to: '#111111',
          },
          'custom.banner.gradient': {
            from: '',
            to: 'linear-gradient(#111,#222)',
          },
        },
        history: [
          {
            path: 'colors.primary',
            from: DEFAULT_TOKEN_STATE.colors.primary,
            to: '#111111',
            source: 'manual',
            at: '2026-02-15T00:00:00.000Z',
          },
          {
            path: 'custom.banner.gradient',
            from: '',
            to: 'linear-gradient(#111,#222)',
            source: 'manual',
            at: '2026-02-15T00:00:01.000Z',
          },
        ],
        annotations: {
          'colors.primary': 'Primary brand color',
          'custom.banner.gradient': 'Hero background gradient',
        },
      },
      TEST_BASE_DIR
    );

    const loaded = await loadProjectTokenState(
      'workspace',
      'home',
      TEST_BASE_DIR
    );

    expect(loaded.values.colors.primary).toBe('#111111');
    expect(loaded.values.custom['banner.gradient']).toBe(
      'linear-gradient(#111,#222)'
    );
    expect(loaded.history).toHaveLength(2);
    expect(loaded.history[1]?.path).toBe('custom.banner.gradient');
    expect(loaded.annotations).toEqual({
      'colors.primary': 'Primary brand color',
      'custom.banner.gradient': 'Hero background gradient',
    });
  });

  it('restores document, data context, and exact token state into workbench stores', async () => {
    await saveProjectDesign('workspace', 'home', SAMPLE_DOCUMENT, TEST_BASE_DIR);
    await saveProjectTokenState(
      'workspace',
      'home',
      {
        values: {
          ...DEFAULT_TOKEN_STATE,
          colors: {
            ...DEFAULT_TOKEN_STATE.colors,
            primary: '#ff0066',
          },
          custom: {
            ...DEFAULT_TOKEN_STATE.custom,
            'brand.outline': '2px solid #ff0066',
          },
        },
        changes: {
          'colors.primary': {
            from: DEFAULT_TOKEN_STATE.colors.primary,
            to: '#ff0066',
          },
          'custom.brand.outline': {
            from: '',
            to: '2px solid #ff0066',
          },
        },
        history: [
          {
            path: 'colors.primary',
            from: DEFAULT_TOKEN_STATE.colors.primary,
            to: '#ff0066',
            source: 'manual',
            at: '2026-02-15T00:00:00.000Z',
          },
        ],
        annotations: {
          'colors.primary': 'Campaign accent',
        },
      },
      TEST_BASE_DIR
    );
    await saveProjectBundleAssociation(
      'workspace',
      {
        sourceRun: {
          runId: 'run-123',
          hostname: 'example.com',
          timestamp: '2026-02-15T00:00:00.000Z',
        },
        bundle: DASHBOARD_BUNDLE,
      },
      TEST_BASE_DIR
    );

    useTokenStateStore.getState().setToken('colors.primary', '#000000');
    useDocumentStateStore.getState().setDocument(null);
    useDataContextStore.getState().setContext({});
    resetStage1BundleStore();

    const restoreResult = await restoreProjectDesignState(
      'workspace',
      'home',
      TEST_BASE_DIR
    );

    expect(restoreResult.restored).toBe(true);
    expect(restoreResult.associatedRunId).toBe('run-123');
    expect(useDocumentStateStore.getState().document?.metadata.title).toBe(
      'Token Persistence Design'
    );
    expect(useDataContextStore.getState().context.account).toEqual({
      name: 'Acme',
    });

    const snapshot = useTokenStateStore.getState().getPersistedSnapshot();
    expect(snapshot.tokens.colors.primary).toBe('#ff0066');
    expect(snapshot.tokens.custom['brand.outline']).toBe('2px solid #ff0066');
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.annotations).toEqual({
      'colors.primary': 'Campaign accent',
    });

    const stage1State = useStage1BundleStore.getState();
    expect(stage1State.bundle).not.toBeNull();
    expect(stage1State.manifest?.contractVersion).toBe('1.0.0');
  });
});
