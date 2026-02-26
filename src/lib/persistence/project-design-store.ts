/**
 * Project-scoped Design CRUD
 *
 * Wraps the legacy design store with project directory scoping.
 */

import {
  deleteDesign,
  designExists,
  listDesigns,
  loadDesign,
  saveDesign,
  type DesignMeta,
} from '@/lib/persistence/design-store';
import { getProjectDir } from '@/lib/persistence/project-layout';
import { loadProjectTokenState } from '@/lib/persistence/project-token-store';
import type { DesignDocument } from '@/types/document-model';
import type { ProjectTokenState } from '@/types/project-model';

export interface DeleteProjectDesignOptions {
  confirm: boolean;
  baseDir?: string;
}

export interface LoadProjectDesignStateResult {
  projectSlug: string;
  slug: string;
  document: DesignDocument;
  dataContext: Record<string, unknown>;
  tokenState: ProjectTokenState;
  restoredAt: string;
}

const projectBaseDir = (projectSlug: string, baseDir?: string): string => {
  return getProjectDir(projectSlug, baseDir);
};

export async function saveProjectDesign(
  projectSlug: string,
  slug: string,
  document: DesignDocument,
  baseDir?: string
): Promise<void> {
  await saveDesign(slug, document, projectBaseDir(projectSlug, baseDir));
}

export async function loadProjectDesign(
  projectSlug: string,
  slug: string,
  baseDir?: string
): Promise<DesignDocument> {
  return loadDesign(slug, projectBaseDir(projectSlug, baseDir));
}

export async function loadProjectDesignState(
  projectSlug: string,
  slug: string,
  baseDir?: string
): Promise<LoadProjectDesignStateResult> {
  const tokenState = await loadProjectTokenState(projectSlug, slug, baseDir);
  const document = await loadProjectDesign(projectSlug, slug, baseDir);
  return {
    projectSlug,
    slug,
    document,
    dataContext: document.data ?? {},
    tokenState,
    restoredAt: new Date().toISOString(),
  };
}

export async function listProjectDesigns(
  projectSlug: string,
  baseDir?: string
): Promise<DesignMeta[]> {
  return listDesigns(projectBaseDir(projectSlug, baseDir));
}

export async function deleteProjectDesign(
  projectSlug: string,
  slug: string,
  options: DeleteProjectDesignOptions
): Promise<void> {
  if (!options.confirm) {
    throw new Error(
      'Delete confirmation required. Pass confirm=true to delete a design.'
    );
  }
  await deleteDesign(slug, projectBaseDir(projectSlug, options.baseDir));
}

export async function projectDesignExists(
  projectSlug: string,
  slug: string,
  baseDir?: string
): Promise<boolean> {
  return designExists(slug, projectBaseDir(projectSlug, baseDir));
}
