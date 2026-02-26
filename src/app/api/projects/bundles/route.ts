import { NextResponse } from 'next/server';

import {
  loadProjectBundleAssociation,
  saveProjectBundleAssociation,
  type SaveProjectBundleAssociationInput,
} from '@/lib/persistence/project-bundle-store';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug')?.trim();

    if (!slug) {
      return NextResponse.json(
        { error: 'Missing project slug' },
        { status: 400 }
      );
    }

    const association = await loadProjectBundleAssociation(slug);
    return NextResponse.json({ association });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';

    if (!slug) {
      return NextResponse.json(
        { error: 'Missing project slug' },
        { status: 400 }
      );
    }

    const input = body?.input as SaveProjectBundleAssociationInput | undefined;
    if (!input?.sourceRun || !input?.bundle) {
      return NextResponse.json(
        { error: 'Missing sourceRun or bundle in input' },
        { status: 400 }
      );
    }

    const association = await saveProjectBundleAssociation(slug, input);
    return NextResponse.json({ association }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
