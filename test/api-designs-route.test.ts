import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

import { designExists } from '../src/lib/persistence/design-store';
import {
  projectDesignExists,
  saveProjectDesign,
} from '../src/lib/persistence/project-design-store';
import { saveProjectTokenState } from '../src/lib/persistence/project-token-store';
import type { DesignDocument } from '../src/types/document-model';
import { DELETE, POST } from '../src/app/api/designs/route';
import { DEFAULT_TOKEN_STATE } from '../src/types/token-state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-api-designs-route-tmp');

const PREVIOUS_CWD = process.cwd();

const SAMPLE_DOCUMENT: DesignDocument = {
  metadata: {
    title: 'Workspace Home',
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
          title: 'Hello',
        },
      },
    ],
  },
  data: {
    brand: 'Workbench',
  },
};

const requestJson = async (response: Response): Promise<any> => {
  return response.json();
};

describe('/api/designs route', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    process.chdir(TEST_BASE_DIR);
  });

  afterEach(async () => {
    process.chdir(PREVIOUS_CWD);
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  it('saves a design in project scope via POST', async () => {
    const response = await POST(
      new Request('http://localhost/api/designs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectSlug: 'workspace',
          slug: 'home',
          document: SAMPLE_DOCUMENT,
          tokenState: {
            values: {
              ...DEFAULT_TOKEN_STATE,
              colors: {
                ...DEFAULT_TOKEN_STATE.colors,
                primary: '#123456',
              },
              custom: {
                ...DEFAULT_TOKEN_STATE.custom,
                'brand.glow': '0 0 0 3px #123456',
              },
            },
            changes: {
              'colors.primary': {
                from: DEFAULT_TOKEN_STATE.colors.primary,
                to: '#123456',
              },
              'custom.brand.glow': {
                from: '',
                to: '0 0 0 3px #123456',
              },
            },
            history: [
              {
                path: 'colors.primary',
                from: DEFAULT_TOKEN_STATE.colors.primary,
                to: '#123456',
                source: 'manual',
                at: '2026-02-15T00:00:00.000Z',
              },
            ],
          },
        }),
      })
    );

    const payload = await requestJson(response);

    expect(response.status).toBe(200);
    expect(payload.saved).toBe(true);
    expect(payload.projectSlug).toBe('workspace');
    expect(
      await projectDesignExists('workspace', 'home', TEST_BASE_DIR)
    ).toBe(true);
  });

  it('requires explicit confirmation before DELETE', async () => {
    await saveProjectDesign(
      'workspace',
      'home',
      SAMPLE_DOCUMENT,
      TEST_BASE_DIR
    );

    const response = await DELETE(
      new Request(
        'http://localhost/api/designs?projectSlug=workspace&slug=home'
      )
    );
    const payload = await requestJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain('confirm=true');
    expect(
      await projectDesignExists('workspace', 'home', TEST_BASE_DIR)
    ).toBe(true);
  });

  it('deletes a project design when confirm=true is provided', async () => {
    await saveProjectDesign(
      'workspace',
      'home',
      SAMPLE_DOCUMENT,
      TEST_BASE_DIR
    );

    const response = await DELETE(
      new Request(
        'http://localhost/api/designs?projectSlug=workspace&slug=home&confirm=true'
      )
    );
    const payload = await requestJson(response);

    expect(response.status).toBe(200);
    expect(payload.deleted).toBe(true);
    expect(
      await projectDesignExists('workspace', 'home', TEST_BASE_DIR)
    ).toBe(false);
  });

  it('still supports legacy (non-project) design CRUD', async () => {
    const saveResponse = await POST(
      new Request('http://localhost/api/designs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'legacy-home',
          document: SAMPLE_DOCUMENT,
        }),
      })
    );
    expect(saveResponse.status).toBe(200);
    expect(await designExists('legacy-home', TEST_BASE_DIR)).toBe(true);

    const deleteResponse = await DELETE(
      new Request(
        'http://localhost/api/designs?slug=legacy-home&confirm=true'
      )
    );
    expect(deleteResponse.status).toBe(200);
    expect(await designExists('legacy-home', TEST_BASE_DIR)).toBe(false);
  });
});
