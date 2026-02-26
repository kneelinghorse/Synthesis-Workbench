/**
 * Project Persistence Model
 *
 * Defines the project-level data model introduced in sprint 10.
 * A project is the top-level unit that owns design documents, token state,
 * Stage1 bundle associations, and reusable data contexts.
 */

import type { DataContext } from '@/lib/engine/data-binding';
import type { DesignDocument } from '@/types/document-model';
import type { Stage1BundlePayload } from '@/types/stage1-bundle';
import type { TokenState } from '@/types/token-state';

export const PROJECT_SCHEMA_VERSION = '1.0.0' as const;
export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;

export interface ProjectMetadata {
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface ProjectDesignRecord {
  slug: string;
  title?: string;
  description?: string;
  file: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TokenMutationSource =
  | 'manual'
  | 'stage1'
  | 'import'
  | 'migration'
  | 'system';

export interface ProjectTokenChange {
  from: string;
  to: string;
}

export interface ProjectTokenHistoryEntry {
  path: string;
  from: string;
  to: string;
  source: TokenMutationSource;
  at: string;
  note?: string;
}

export type ProjectPreviewTheme = 'base' | 'dark' | 'hc';

export interface ProjectTokenState {
  values: TokenState;
  changes: Record<string, ProjectTokenChange>;
  history: ProjectTokenHistoryEntry[];
  annotations: Record<string, string>;
  theme?: ProjectPreviewTheme;
  updatedAt: string;
}

export interface ProjectTokenLedger {
  byDesign: Record<string, ProjectTokenState>;
  activeDesignSlug?: string;
  updatedAt: string;
}

export interface ProjectBundleReference {
  runId: string;
  hostname?: string;
  capturedAt?: string;
  manifestPath?: string;
  bundlePath?: string;
  associatedAt: string;
}

export interface ProjectBundleAssociation {
  sourceRun: ProjectBundleReference;
  bundle: Stage1BundlePayload | null;
  updatedAt: string;
}

export interface ProjectDataContextEntry {
  id: string;
  name: string;
  data: DataContext;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Relationship model:
 * project -> designs, tokens, bundle association, data contexts.
 * Paths are relative to ./projects/{slug}/.
 */
export interface ProjectRelationships {
  designs: ProjectDesignRecord[];
  tokensFile: string;
  bundleFile: string;
  dataContextsFile: string;
}

export interface ProjectManifest {
  schemaVersion: ProjectSchemaVersion;
  metadata: ProjectMetadata;
  relationships: ProjectRelationships;
  activeDesignSlug?: string;
  activeDataContextId?: string;
}

export interface ProjectState {
  manifest: ProjectManifest;
  designs: Record<string, DesignDocument>;
  tokens: ProjectTokenState;
  bundle: ProjectBundleReference | null;
  dataContexts: ProjectDataContextEntry[];
}

export interface LegacyDesignMigrationItem {
  slug: string;
  sourcePath: string;
  targetPath: string;
  metadata: ProjectDesignRecord;
}

export interface LegacyDesignMigrationPlan {
  projectSlug: string;
  projectDir: string;
  manifestPath: string;
  steps: LegacyDesignMigrationItem[];
  notes: string[];
}
