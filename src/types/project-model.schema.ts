/**
 * Project Model Zod Validation Schemas
 */

import { z } from 'zod';

import type {
  LegacyDesignMigrationItem,
  LegacyDesignMigrationPlan,
  ProjectBundleAssociation,
  ProjectBundleReference,
  ProjectDataContextEntry,
  ProjectDesignRecord,
  ProjectManifest,
  ProjectMetadata,
  ProjectRelationships,
  ProjectState,
  ProjectTokenChange,
  ProjectTokenHistoryEntry,
  ProjectTokenLedger,
  ProjectTokenState,
  ProjectPreviewTheme,
  TokenMutationSource,
} from './project-model';
import type { TokenState } from './token-state';
import { designDocumentSchema } from './document-model.schema';

const isoDateTimeSchema = z.iso.datetime();

const tokenMutationSourceSchema = z.enum([
  'manual',
  'stage1',
  'import',
  'migration',
  'system',
]) satisfies z.ZodType<TokenMutationSource>;

const previewThemeSchema = z.enum([
  'base',
  'dark',
  'hc',
]) satisfies z.ZodType<ProjectPreviewTheme>;

const tokenStateSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    surface: z.string(),
    text: z.object({
      primary: z.string(),
      secondary: z.string(),
      disabled: z.string(),
    }),
    status: z.object({
      success: z.string(),
      warning: z.string(),
      error: z.string(),
      info: z.string(),
    }),
    border: z.string(),
  }),
  typography: z.object({
    fontFamily: z.object({
      sans: z.string(),
      mono: z.string(),
    }),
    fontSize: z.object({
      xs: z.string(),
      sm: z.string(),
      base: z.string(),
      lg: z.string(),
      xl: z.string(),
      '2xl': z.string(),
      '3xl': z.string(),
    }),
    fontWeight: z.object({
      normal: z.string(),
      medium: z.string(),
      semibold: z.string(),
      bold: z.string(),
    }),
    lineHeight: z.object({
      tight: z.string(),
      normal: z.string(),
      relaxed: z.string(),
    }),
  }),
  spacing: z.object({
    xs: z.string(),
    sm: z.string(),
    md: z.string(),
    lg: z.string(),
    xl: z.string(),
    '2xl': z.string(),
  }),
  radius: z.object({
    none: z.string(),
    sm: z.string(),
    md: z.string(),
    lg: z.string(),
    full: z.string(),
  }),
  shadow: z.object({
    sm: z.string(),
    md: z.string(),
    lg: z.string(),
  }),
  custom: z.record(z.string(), z.string()),
}) satisfies z.ZodType<TokenState>;

export const projectTokenChangeSchema = z.object({
  from: z.string(),
  to: z.string(),
}) satisfies z.ZodType<ProjectTokenChange>;

export const projectTokenHistoryEntrySchema = z.object({
  path: z.string().min(1),
  from: z.string(),
  to: z.string(),
  source: tokenMutationSourceSchema,
  at: isoDateTimeSchema,
  note: z.string().optional(),
}) satisfies z.ZodType<ProjectTokenHistoryEntry>;

export const projectTokenStateSchema = z.object({
  values: tokenStateSchema,
  changes: z.record(z.string(), projectTokenChangeSchema),
  history: z.array(projectTokenHistoryEntrySchema),
  annotations: z.record(z.string(), z.string()).default({}),
  theme: previewThemeSchema.optional(),
  updatedAt: isoDateTimeSchema,
}) satisfies z.ZodType<ProjectTokenState>;

export const projectTokenLedgerSchema = z.object({
  byDesign: z.record(z.string(), projectTokenStateSchema),
  activeDesignSlug: z.string().regex(/^[a-z0-9_-]+$/i).optional(),
  updatedAt: isoDateTimeSchema,
}) satisfies z.ZodType<ProjectTokenLedger>;

export const projectMetadataSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9_-]+$/i),
  description: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  tags: z.array(z.string()).optional(),
}) satisfies z.ZodType<ProjectMetadata>;

export const projectDesignRecordSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]+$/i),
  title: z.string().optional(),
  description: z.string().optional(),
  file: z.string().min(1),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
}) satisfies z.ZodType<ProjectDesignRecord>;

export const projectBundleReferenceSchema = z.object({
  runId: z.string().min(1),
  hostname: z.string().optional(),
  capturedAt: isoDateTimeSchema.optional(),
  manifestPath: z.string().optional(),
  bundlePath: z.string().optional(),
  associatedAt: isoDateTimeSchema,
}) satisfies z.ZodType<ProjectBundleReference>;

export const projectBundleAssociationSchema = z.object({
  sourceRun: projectBundleReferenceSchema,
  bundle: z.unknown().nullable(),
  updatedAt: isoDateTimeSchema,
});

export const projectDataContextEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  source: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}) satisfies z.ZodType<ProjectDataContextEntry>;

export const projectRelationshipsSchema = z.object({
  designs: z.array(projectDesignRecordSchema),
  tokensFile: z.string().min(1),
  bundleFile: z.string().min(1),
  dataContextsFile: z.string().min(1),
}) satisfies z.ZodType<ProjectRelationships>;

export const projectManifestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  metadata: projectMetadataSchema,
  relationships: projectRelationshipsSchema,
  activeDesignSlug: z.string().regex(/^[a-z0-9_-]+$/i).optional(),
  activeDataContextId: z.string().min(1).optional(),
}) satisfies z.ZodType<ProjectManifest>;

export const projectStateSchema = z.object({
  manifest: projectManifestSchema,
  designs: z.record(z.string(), designDocumentSchema),
  tokens: projectTokenStateSchema,
  bundle: projectBundleReferenceSchema.nullable(),
  dataContexts: z.array(projectDataContextEntrySchema),
});

export const legacyDesignMigrationItemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]+$/i),
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  metadata: projectDesignRecordSchema,
}) satisfies z.ZodType<LegacyDesignMigrationItem>;

export const legacyDesignMigrationPlanSchema = z.object({
  projectSlug: z.string().regex(/^[a-z0-9_-]+$/i),
  projectDir: z.string().min(1),
  manifestPath: z.string().min(1),
  steps: z.array(legacyDesignMigrationItemSchema),
  notes: z.array(z.string()),
}) satisfies z.ZodType<LegacyDesignMigrationPlan>;

export function parseProjectManifest(data: unknown): ProjectManifest {
  return projectManifestSchema.parse(data);
}

export function safeParseProjectManifest(data: unknown) {
  return projectManifestSchema.safeParse(data);
}

export function parseProjectState(data: unknown): ProjectState {
  return projectStateSchema.parse(data) as ProjectState;
}

export function safeParseProjectState(data: unknown) {
  return projectStateSchema.safeParse(data);
}

export function parseProjectTokenState(data: unknown): ProjectTokenState {
  return projectTokenStateSchema.parse(data);
}

export function parseProjectTokenLedger(data: unknown): ProjectTokenLedger {
  return projectTokenLedgerSchema.parse(data);
}

export function parseProjectBundleReference(data: unknown): ProjectBundleReference {
  return projectBundleReferenceSchema.parse(data);
}

export function parseProjectBundleAssociation(
  data: unknown
): ProjectBundleAssociation {
  return projectBundleAssociationSchema.parse(data) as ProjectBundleAssociation;
}

export function parseLegacyDesignMigrationPlan(
  data: unknown
): LegacyDesignMigrationPlan {
  return legacyDesignMigrationPlanSchema.parse(data);
}
