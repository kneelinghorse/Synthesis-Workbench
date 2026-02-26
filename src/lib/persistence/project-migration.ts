/**
 * Legacy Design Migration -> Project Persistence
 *
 * Migration path from ./designs/*.design.yaml to
 * ./projects/{slug}/... project-scoped state.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

import {
  DESIGNS_DIR,
  loadDesign,
  saveDesign,
  type DesignMeta,
  listDesigns,
} from '@/lib/persistence/design-store';
import {
  describeProjectLayout,
  getProjectDir,
  getProjectDesignPath,
  toProjectRelativePath,
} from '@/lib/persistence/project-layout';
import type {
  LegacyDesignMigrationPlan,
  ProjectManifest,
  ProjectTokenLedger,
} from '@/types/project-model';
import {
  parseLegacyDesignMigrationPlan,
  parseProjectManifest,
  parseProjectTokenLedger,
} from '@/types/project-model.schema';

export interface BuildLegacyDesignMigrationPlanOptions {
  projectSlug: string;
  projectName: string;
  description?: string;
  baseDir?: string;
  now?: string;
}

export interface MigrateLegacyDesignsOptions
  extends BuildLegacyDesignMigrationPlanOptions {
  dryRun?: boolean;
}

export interface MigrationCopyOperation {
  from: string;
  to: string;
}

export interface MigrateLegacyDesignsResult {
  dryRun: boolean;
  plan: LegacyDesignMigrationPlan;
  manifest: ProjectManifest;
  tokenLedger: ProjectTokenLedger;
  copied: MigrationCopyOperation[];
}

const readLegacyDesigns = async (baseDir?: string): Promise<DesignMeta[]> => {
  const designs = await listDesigns(baseDir);
  return designs.sort((a, b) => a.slug.localeCompare(b.slug));
};

const buildProjectManifest = (
  options: BuildLegacyDesignMigrationPlanOptions,
  plan: LegacyDesignMigrationPlan,
  now: string
): ProjectManifest => {
  const relationships = {
    designs: plan.steps.map((step) => step.metadata),
    tokensFile: 'state/tokens.yaml',
    bundleFile: 'state/bundle.yaml',
    dataContextsFile: 'state/data-contexts.yaml',
  };

  return parseProjectManifest({
    schemaVersion: '1.0.0',
    metadata: {
      name: options.projectName,
      slug: options.projectSlug,
      description: options.description,
      createdAt: now,
      updatedAt: now,
    },
    relationships,
    activeDesignSlug: plan.steps[0]?.slug,
  });
};

const buildDefaultTokenLedger = (now: string): ProjectTokenLedger => {
  return parseProjectTokenLedger({
    byDesign: {},
    activeDesignSlug: undefined,
    updatedAt: now,
  });
};

const toMigrationStep = (
  projectSlug: string,
  meta: DesignMeta,
  baseDir?: string
) => {
  const targetPath = getProjectDesignPath(projectSlug, meta.slug, baseDir);
  const sourceBase = baseDir ?? process.cwd();
  const sourcePath = path.join(sourceBase, DESIGNS_DIR, `${meta.slug}.design.yaml`);

  return {
    slug: meta.slug,
    sourcePath,
    targetPath,
    metadata: {
      slug: meta.slug,
      title: meta.title,
      description: meta.description,
      file: toProjectRelativePath(projectSlug, targetPath, baseDir),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
  };
};

export async function buildLegacyDesignMigrationPlan(
  options: BuildLegacyDesignMigrationPlanOptions
): Promise<LegacyDesignMigrationPlan> {
  const now = options.now ?? new Date().toISOString();
  const layout = describeProjectLayout(options.projectSlug, options.baseDir);
  const legacyDesigns = await readLegacyDesigns(options.baseDir);

  const steps = legacyDesigns.map((meta) =>
    toMigrationStep(options.projectSlug, meta, options.baseDir)
  );

  return parseLegacyDesignMigrationPlan({
    projectSlug: options.projectSlug,
    projectDir: layout.projectDir,
    manifestPath: layout.manifestPath,
    steps,
    notes: [
      `Scaffold project at ./projects/${options.projectSlug}/ with project.yaml and state files.`,
      'Copy legacy designs from ./designs/*.design.yaml into project-scoped designs/ directory.',
      'Keep legacy ./designs files in place for rollback during sprint 10 migration.',
      `Initialize project token state from current DEFAULT_TOKEN_STATE as of ${now}.`,
    ],
  });
}

async function copyLegacyDesigns(
  plan: LegacyDesignMigrationPlan,
  baseDir?: string
): Promise<MigrationCopyOperation[]> {
  const copied: MigrationCopyOperation[] = [];
  for (const step of plan.steps) {
    const design = await loadDesign(step.slug, baseDir);
    await saveDesign(step.slug, design, getProjectDir(plan.projectSlug, baseDir));
    copied.push({ from: step.sourcePath, to: step.targetPath });
  }
  return copied;
}

export async function migrateLegacyDesignsToProject(
  options: MigrateLegacyDesignsOptions
): Promise<MigrateLegacyDesignsResult> {
  const now = options.now ?? new Date().toISOString();
  const plan = await buildLegacyDesignMigrationPlan({ ...options, now });
  const layout = describeProjectLayout(options.projectSlug, options.baseDir);
  const manifest = buildProjectManifest(options, plan, now);
  const tokenLedger = buildDefaultTokenLedger(now);

  if (options.dryRun) {
    return {
      dryRun: true,
      plan,
      manifest,
      tokenLedger,
      copied: [],
    };
  }

  await fs.mkdir(layout.designsDir, { recursive: true });
  await fs.mkdir(layout.stateDir, { recursive: true });

  const copied = await copyLegacyDesigns(plan, options.baseDir);

  await fs.writeFile(layout.manifestPath, yaml.dump(manifest), 'utf-8');
  await fs.writeFile(layout.tokensPath, yaml.dump(tokenLedger), 'utf-8');
  await fs.writeFile(layout.bundlePath, yaml.dump({ bundle: null }), 'utf-8');
  await fs.writeFile(layout.dataContextsPath, yaml.dump([]), 'utf-8');

  return {
    dryRun: false,
    plan,
    manifest,
    tokenLedger,
    copied,
  };
}
