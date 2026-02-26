/**
 * Project-scoped Stage1 Bundle Association Persistence
 *
 * Persists Stage1 run association and optional bundle payload at:
 * ./projects/{projectSlug}/state/bundle.yaml
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { getProjectBundlePath } from '@/lib/persistence/project-layout';
import type {
  ProjectBundleAssociation,
  ProjectBundleReference,
} from '@/types/project-model';
import {
  parseProjectBundleAssociation,
  parseProjectBundleReference,
} from '@/types/project-model.schema';
import type { Stage1BundlePayload } from '@/types/stage1-bundle';

export interface SaveProjectBundleAssociationInput {
  sourceRun: {
    runId: string;
    hostname?: string;
    timestamp?: string;
    manifestPath?: string;
    bundlePath?: string;
  };
  bundle: Stage1BundlePayload;
  associatedAt?: string;
}

const isNotFound = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

const normalizeReference = (
  sourceRun: SaveProjectBundleAssociationInput['sourceRun'],
  associatedAt: string
): ProjectBundleReference => {
  return parseProjectBundleReference({
    runId: sourceRun.runId,
    hostname: sourceRun.hostname,
    capturedAt: sourceRun.timestamp,
    manifestPath: sourceRun.manifestPath,
    bundlePath: sourceRun.bundlePath,
    associatedAt,
  });
};

export async function saveProjectBundleAssociation(
  projectSlug: string,
  input: SaveProjectBundleAssociationInput,
  baseDir?: string
): Promise<ProjectBundleAssociation> {
  const now = input.associatedAt ?? new Date().toISOString();
  const association = parseProjectBundleAssociation({
    sourceRun: normalizeReference(input.sourceRun, now),
    bundle: input.bundle,
    updatedAt: now,
  });

  const filePath = getProjectBundlePath(projectSlug, baseDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yaml.dump(association), 'utf-8');

  return association;
}

export async function loadProjectBundleAssociation(
  projectSlug: string,
  baseDir?: string
): Promise<ProjectBundleAssociation | null> {
  const filePath = getProjectBundlePath(projectSlug, baseDir);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (!('bundle' in record)) {
      return null;
    }

    // Backwards compatibility: initial scaffold may contain only { bundle: null }.
    if (!('sourceRun' in record) && record.bundle === null) {
      return null;
    }

    try {
      return parseProjectBundleAssociation(parsed);
    } catch {
      return null;
    }
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw new Error(
      `Failed to load project bundle association: ${(error as Error).message}`
    );
  }
}

export async function clearProjectBundleAssociation(
  projectSlug: string,
  baseDir?: string
): Promise<void> {
  const filePath = getProjectBundlePath(projectSlug, baseDir);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
}
