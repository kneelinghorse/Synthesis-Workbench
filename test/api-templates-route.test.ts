import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

import type { DesignDocument } from '../src/types/document-model';
import { GET, POST } from '../src/app/api/templates/route';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-api-templates-route-tmp');
const PREVIOUS_CWD = process.cwd();

const SAMPLE_DOCUMENT: DesignDocument = {
  metadata: {
    title: 'Ops Dashboard',
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
        id: 'nav-1',
        ref: 'oods:Navbar',
        props: {},
      },
      {
        nodeType: 'component',
        id: 'card-1',
        ref: 'oods:MetricCard',
        props: {},
      },
    ],
  },
  data: {
    user: { id: 'u-1' },
  },
};

const requestJson = async (response: Response): Promise<any> => response.json();

describe('/api/templates route', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    process.chdir(TEST_BASE_DIR);
  });

  afterEach(async () => {
    process.chdir(PREVIOUS_CWD);
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  it('lists built-in templates via GET', async () => {
    const response = await GET(new Request('http://localhost/api/templates'));
    const payload = await requestJson(response);

    expect(response.status).toBe(200);
    expect(payload.listed).toBe(true);
    expect(payload.count).toBeGreaterThanOrEqual(5);
    expect(
      payload.templates.some(
        (template: { source: string; slug: string }) =>
          template.source === 'built-in' && template.slug === 'dashboard'
      )
    ).toBe(true);
  });

  it('saves a custom template via POST and returns it in GET listing', async () => {
    const postResponse = await POST(
      new Request('http://localhost/api/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'ops-dashboard',
          name: 'Ops Dashboard',
          description: 'Operations dashboard starter',
          category: 'dashboard',
          document: SAMPLE_DOCUMENT,
        }),
      })
    );
    const postPayload = await requestJson(postResponse);

    expect(postResponse.status).toBe(200);
    expect(postPayload.saved).toBe(true);
    expect(postPayload.slug).toBe('ops-dashboard');
    expect(postPayload.source).toBe('custom');
    expect(postPayload.requiredComponents).toEqual([
      'oods:Navbar',
      'oods:MetricCard',
    ]);

    const listResponse = await GET(new Request('http://localhost/api/templates'));
    const listPayload = await requestJson(listResponse);
    expect(
      listPayload.templates.some(
        (template: { source: string; slug: string }) =>
          template.source === 'custom' && template.slug === 'ops-dashboard'
      )
    ).toBe(true);

    const loadResponse = await GET(
      new Request('http://localhost/api/templates?slug=ops-dashboard')
    );
    const loadPayload = await requestJson(loadResponse);
    expect(loadResponse.status).toBe(200);
    expect(loadPayload.loaded).toBe(true);
    expect(loadPayload.source).toBe('custom');
    expect(loadPayload.template.kind).toBe('template');
  });

  it('loads built-in template details by slug', async () => {
    const response = await GET(
      new Request('http://localhost/api/templates?slug=dashboard')
    );
    const payload = await requestJson(response);

    expect(response.status).toBe(200);
    expect(payload.loaded).toBe(true);
    expect(payload.source).toBe('built-in');
    expect(payload.slug).toBe('dashboard');
    expect(payload.template.kind).toBe('template');
  });

  it('returns 400 when required POST fields are missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '',
          description: 'missing',
          category: 'dashboard',
        }),
      })
    );
    const payload = await requestJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain('Missing required field');
  });
});
