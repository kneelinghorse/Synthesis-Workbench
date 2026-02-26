/**
 * Project-scoped Token State Persistence
 *
 * Persists token state snapshots per design under:
 * ./projects/{projectSlug}/state/tokens.yaml
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { getProjectTokensPath } from '@/lib/persistence/project-layout';
import type {
  ProjectTokenHistoryEntry,
  ProjectTokenLedger,
  ProjectTokenState,
} from '@/types/project-model';
import {
  parseProjectTokenLedger,
  parseProjectTokenState,
} from '@/types/project-model.schema';
import { DEFAULT_TOKEN_STATE, type TokenState } from '@/types/token-state';

export interface ProjectTokenSnapshotInput {
  values: TokenState;
  changes?: Record<string, { from: string; to: string }>;
  history?: ProjectTokenHistoryEntry[];
  annotations?: Record<string, string>;
  theme?: 'base' | 'dark' | 'hc';
  updatedAt?: string;
}

const isNotFound = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

const buildTokenState = (
  input: ProjectTokenSnapshotInput | undefined,
  now = new Date().toISOString()
): ProjectTokenState => {
  return parseProjectTokenState({
    values: input?.values ?? DEFAULT_TOKEN_STATE,
    changes: input?.changes ?? {},
    history: input?.history ?? [],
    annotations: input?.annotations ?? {},
    theme: input?.theme,
    updatedAt: input?.updatedAt ?? now,
  });
};

const emptyLedger = (now = new Date().toISOString()): ProjectTokenLedger => ({
  byDesign: {},
  updatedAt: now,
});

export async function loadProjectTokenLedger(
  projectSlug: string,
  baseDir?: string
): Promise<ProjectTokenLedger> {
  const filePath = getProjectTokensPath(projectSlug, baseDir);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(raw);
    return parseProjectTokenLedger(parsed);
  } catch (error) {
    if (isNotFound(error)) {
      return emptyLedger();
    }
    throw new Error(`Failed to load project token ledger: ${(error as Error).message}`);
  }
}

export async function saveProjectTokenLedger(
  projectSlug: string,
  ledger: ProjectTokenLedger,
  baseDir?: string
): Promise<void> {
  const filePath = getProjectTokensPath(projectSlug, baseDir);
  const parsed = parseProjectTokenLedger(ledger);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yaml.dump(parsed), 'utf-8');
}

export async function saveProjectTokenState(
  projectSlug: string,
  designSlug: string,
  snapshot: ProjectTokenSnapshotInput,
  baseDir?: string
): Promise<ProjectTokenLedger> {
  const now = new Date().toISOString();
  const ledger = await loadProjectTokenLedger(projectSlug, baseDir);

  ledger.byDesign[designSlug] = buildTokenState(snapshot, now);
  ledger.activeDesignSlug = designSlug;
  ledger.updatedAt = now;

  await saveProjectTokenLedger(projectSlug, ledger, baseDir);
  return ledger;
}

export async function loadProjectTokenState(
  projectSlug: string,
  designSlug: string,
  baseDir?: string
): Promise<ProjectTokenState> {
  const ledger = await loadProjectTokenLedger(projectSlug, baseDir);
  const byDesign = ledger.byDesign[designSlug];
  if (byDesign) {
    return byDesign;
  }

  return buildTokenState(undefined);
}
