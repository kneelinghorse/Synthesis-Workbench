/**
 * Project Persistence Layout
 *
 * Canonical filesystem layout for sprint 10 project-scoped persistence.
 */

import * as path from 'path';

import { isValidSlug, DESIGN_EXTENSION } from '@/lib/persistence/design-store';

export const PROJECTS_DIR = 'projects';
export const PROJECT_MANIFEST_FILE = 'project.yaml';
export const PROJECT_DESIGNS_DIR = 'designs';
export const PROJECT_STATE_DIR = 'state';
export const PROJECT_TOKENS_FILE = 'tokens.yaml';
export const PROJECT_BUNDLE_FILE = 'bundle.yaml';
export const PROJECT_DATA_CONTEXTS_FILE = 'data-contexts.yaml';

export interface ProjectPathLayout {
  rootDir: string;
  projectDir: string;
  manifestPath: string;
  designsDir: string;
  stateDir: string;
  tokensPath: string;
  bundlePath: string;
  dataContextsPath: string;
}

const assertSlug = (slug: string, label: string) => {
  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid ${label} slug: ${slug}. Must contain only alphanumeric characters, hyphens, and underscores.`
    );
  }
};

const asPosix = (value: string) => value.split(path.sep).join('/');

export function getProjectsRootDir(baseDir?: string): string {
  const base = baseDir ?? process.cwd();
  return path.join(base, PROJECTS_DIR);
}

export function getProjectDir(projectSlug: string, baseDir?: string): string {
  assertSlug(projectSlug, 'project');
  return path.join(getProjectsRootDir(baseDir), projectSlug);
}

export function getProjectManifestPath(
  projectSlug: string,
  baseDir?: string
): string {
  return path.join(getProjectDir(projectSlug, baseDir), PROJECT_MANIFEST_FILE);
}

export function getProjectDesignsDir(
  projectSlug: string,
  baseDir?: string
): string {
  return path.join(getProjectDir(projectSlug, baseDir), PROJECT_DESIGNS_DIR);
}

export function getProjectDesignPath(
  projectSlug: string,
  designSlug: string,
  baseDir?: string
): string {
  assertSlug(designSlug, 'design');
  return path.join(
    getProjectDesignsDir(projectSlug, baseDir),
    `${designSlug}${DESIGN_EXTENSION}`
  );
}

export function getProjectStateDir(
  projectSlug: string,
  baseDir?: string
): string {
  return path.join(getProjectDir(projectSlug, baseDir), PROJECT_STATE_DIR);
}

export function getProjectTokensPath(
  projectSlug: string,
  baseDir?: string
): string {
  return path.join(getProjectStateDir(projectSlug, baseDir), PROJECT_TOKENS_FILE);
}

export function getProjectBundlePath(
  projectSlug: string,
  baseDir?: string
): string {
  return path.join(getProjectStateDir(projectSlug, baseDir), PROJECT_BUNDLE_FILE);
}

export function getProjectDataContextsPath(
  projectSlug: string,
  baseDir?: string
): string {
  return path.join(
    getProjectStateDir(projectSlug, baseDir),
    PROJECT_DATA_CONTEXTS_FILE
  );
}

export function describeProjectLayout(
  projectSlug: string,
  baseDir?: string
): ProjectPathLayout {
  return {
    rootDir: getProjectsRootDir(baseDir),
    projectDir: getProjectDir(projectSlug, baseDir),
    manifestPath: getProjectManifestPath(projectSlug, baseDir),
    designsDir: getProjectDesignsDir(projectSlug, baseDir),
    stateDir: getProjectStateDir(projectSlug, baseDir),
    tokensPath: getProjectTokensPath(projectSlug, baseDir),
    bundlePath: getProjectBundlePath(projectSlug, baseDir),
    dataContextsPath: getProjectDataContextsPath(projectSlug, baseDir),
  };
}

export function toProjectRelativePath(
  projectSlug: string,
  absolutePath: string,
  baseDir?: string
): string {
  const projectDir = getProjectDir(projectSlug, baseDir);
  return asPosix(path.relative(projectDir, absolutePath));
}
