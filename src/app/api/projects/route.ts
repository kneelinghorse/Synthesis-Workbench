import { NextResponse } from 'next/server';

import {
  createProject,
  listProjects,
  loadProjectWorkspace,
} from '@/lib/persistence/project-catalog';
import type { SaveProjectBundleAssociationInput } from '@/lib/persistence/project-bundle-store';

const isNotFoundError = (message: string) =>
  message.toLowerCase().includes('not found');

const parseQuerySlug = (value: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = parseQuerySlug(url.searchParams.get('slug'));

    if (slug) {
      const workspace = await loadProjectWorkspace(slug);
      return NextResponse.json({
        project: workspace.summary,
        workspace,
      });
    }

    const projects = await listProjects();
    return NextResponse.json({
      projects,
      count: projects.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = isNotFoundError(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json(
        { error: 'Missing or invalid project name' },
        { status: 400 }
      );
    }

    const slug =
      typeof body?.slug === 'string' && body.slug.trim()
        ? body.slug.trim()
        : undefined;
    const description =
      typeof body?.description === 'string' && body.description.trim()
        ? body.description.trim()
        : undefined;

    const bundleAssociation =
      body?.bundleAssociation && typeof body.bundleAssociation === 'object'
        ? (body.bundleAssociation as SaveProjectBundleAssociationInput)
        : undefined;

    const created = await createProject({
      name,
      slug,
      description,
      bundleAssociation,
    });

    return NextResponse.json({ created: true, project: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
