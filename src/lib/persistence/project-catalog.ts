/**
 * Project Catalog & Workspace Loader
 */

import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';

import {
  getProjectsRootDir,
  describeProjectLayout,
  getProjectManifestPath,
} from '@/lib/persistence/project-layout';
import {
  listProjectDesigns,
  loadProjectDesignState,
  type LoadProjectDesignStateResult,
} from '@/lib/persistence/project-design-store';
import {
  loadProjectBundleAssociation,
  saveProjectBundleAssociation,
  type SaveProjectBundleAssociationInput,
} from '@/lib/persistence/project-bundle-store';
import { saveProjectTokenLedger } from '@/lib/persistence/project-token-store';
import type {
  ProjectBundleAssociation,
  ProjectManifest,
} from '@/types/project-model';
import {
  parseProjectManifest,
  parseProjectTokenLedger,
} from '@/types/project-model.schema';

export interface ProjectSummary {
  slug: string;
  name: string;
  description?: string;
  designCount: number;
  activeDesignSlug?: string;
  updatedAt: string;
  lastModifiedAt: string;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  description?: string;
  bundleAssociation?: SaveProjectBundleAssociationInput;
  baseDir?: string;
}

export interface ProjectWorkspacePayload {
  manifest: ProjectManifest;
  summary: ProjectSummary;
  designs: Array<{
    slug: string;
    title?: string;
    updatedAt?: string;
  }>;
  activeDesignSlug: string | null;
  workspace: LoadProjectDesignStateResult | null;
  bundleAssociation: ProjectBundleAssociation | null;
}

const toIso = (value: Date | number | string | undefined): string => {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

export const slugifyProjectName = (name: string): string => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'project';
};

const readProjectManifest = async (
  projectSlug: string,
  baseDir?: string
): Promise<ProjectManifest> => {
  const filePath = getProjectManifestPath(projectSlug, baseDir);
  const raw = await fs.readFile(filePath, 'utf-8');
  return parseProjectManifest(yaml.load(raw));
};

const writeProjectManifest = async (
  projectSlug: string,
  manifest: ProjectManifest,
  baseDir?: string
): Promise<void> => {
  const filePath = getProjectManifestPath(projectSlug, baseDir);
  await fs.writeFile(filePath, yaml.dump(parseProjectManifest(manifest)), 'utf-8');
};

const projectExists = async (
  projectSlug: string,
  baseDir?: string
): Promise<boolean> => {
  try {
    await fs.access(getProjectManifestPath(projectSlug, baseDir));
    return true;
  } catch {
    return false;
  }
};

export async function setProjectActiveDesign(
  projectSlug: string,
  designSlug: string,
  baseDir?: string
): Promise<ProjectManifest> {
  const manifest = await readProjectManifest(projectSlug, baseDir);
  const updated = parseProjectManifest({
    ...manifest,
    activeDesignSlug: designSlug,
    metadata: {
      ...manifest.metadata,
      updatedAt: new Date().toISOString(),
    },
  });
  await writeProjectManifest(projectSlug, updated, baseDir);
  return updated;
}

export async function listProjects(baseDir?: string): Promise<ProjectSummary[]> {
  const rootDir = getProjectsRootDir(baseDir);

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<ProjectSummary | null> => {
          const slug = entry.name;
          try {
            const manifest = await readProjectManifest(slug, baseDir);
            const designs = await listProjectDesigns(slug, baseDir);
            const stats = await fs.stat(describeProjectLayout(slug, baseDir).projectDir);
            return {
              slug,
              name: manifest.metadata.name,
              description: manifest.metadata.description,
              designCount: designs.length,
              activeDesignSlug: manifest.activeDesignSlug,
              updatedAt: manifest.metadata.updatedAt,
              lastModifiedAt: toIso(stats.mtime),
            };
          } catch {
            return null;
          }
        })
    );

    const valid = projects.filter(
      (entry): entry is ProjectSummary => Boolean(entry)
    );
    return valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function createProject(
  input: CreateProjectInput
): Promise<ProjectSummary> {
  const now = new Date().toISOString();
  const baseDir = input.baseDir;
  const slug = input.slug?.trim() || slugifyProjectName(input.name);

  if (await projectExists(slug, baseDir)) {
    throw new Error(`Project already exists: ${slug}`);
  }

  const layout = describeProjectLayout(slug, baseDir);
  await fs.mkdir(layout.designsDir, { recursive: true });
  await fs.mkdir(layout.stateDir, { recursive: true });

  const manifest = parseProjectManifest({
    schemaVersion: '1.0.0',
    metadata: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    },
    relationships: {
      designs: [],
      tokensFile: 'state/tokens.yaml',
      bundleFile: 'state/bundle.yaml',
      dataContextsFile: 'state/data-contexts.yaml',
    },
  });

  await writeProjectManifest(slug, manifest, baseDir);
  await saveProjectTokenLedger(
    slug,
    parseProjectTokenLedger({
      byDesign: {},
      updatedAt: now,
    }),
    baseDir
  );
  await fs.writeFile(layout.dataContextsPath, yaml.dump([]), 'utf-8');

  if (input.bundleAssociation) {
    await saveProjectBundleAssociation(slug, input.bundleAssociation, baseDir);
  } else {
    await fs.writeFile(layout.bundlePath, yaml.dump({ bundle: null }), 'utf-8');
  }

  const stats = await fs.stat(layout.projectDir);
  return {
    slug,
    name: manifest.metadata.name,
    description: manifest.metadata.description,
    designCount: 0,
    activeDesignSlug: undefined,
    updatedAt: manifest.metadata.updatedAt,
    lastModifiedAt: toIso(stats.mtime),
  };
}

export async function loadProjectWorkspace(
  projectSlug: string,
  baseDir?: string
): Promise<ProjectWorkspacePayload> {
  const manifest = await readProjectManifest(projectSlug, baseDir);
  const designs = await listProjectDesigns(projectSlug, baseDir);
  const designSlugs = new Set(designs.map((design) => design.slug));
  const activeDesignSlug =
    manifest.activeDesignSlug && designSlugs.has(manifest.activeDesignSlug)
      ? manifest.activeDesignSlug
      : designs[0]?.slug ?? null;

  const workspace = activeDesignSlug
    ? await loadProjectDesignState(projectSlug, activeDesignSlug, baseDir)
    : null;
  const bundleAssociation = await loadProjectBundleAssociation(projectSlug, baseDir);

  const stats = await fs.stat(describeProjectLayout(projectSlug, baseDir).projectDir);
  const summary: ProjectSummary = {
    slug: projectSlug,
    name: manifest.metadata.name,
    description: manifest.metadata.description,
    designCount: designs.length,
    activeDesignSlug: activeDesignSlug ?? undefined,
    updatedAt: manifest.metadata.updatedAt,
    lastModifiedAt: toIso(stats.mtime),
  };

  return {
    manifest,
    summary,
    designs: designs.map((design) => ({
      slug: design.slug,
      title: design.title,
      updatedAt: design.updatedAt,
    })),
    activeDesignSlug,
    workspace,
    bundleAssociation,
  };
}
