import { NextResponse } from 'next/server';

import {
  deleteDesign,
  getDesignPath,
  listDesigns,
  loadDesign,
  saveDesign,
} from '@/lib/persistence/design-store';
import {
  deleteProjectDesign,
  listProjectDesigns,
  loadProjectDesignState,
  saveProjectDesign,
} from '@/lib/persistence/project-design-store';
import { setProjectActiveDesign } from '@/lib/persistence/project-catalog';
import { getProjectDesignPath } from '@/lib/persistence/project-layout';
import { saveProjectTokenState } from '@/lib/persistence/project-token-store';
import { parseDesignDocument } from '@/types/document-model.schema';

/**
 * POST /api/designs — Persist a design document to YAML
 * GET /api/designs — List project designs or load one by slug
 * DELETE /api/designs — Delete a design (confirm=true required)
 *
 * Body (POST): {
 *   projectSlug?: string,
 *   slug: string,
 *   document: DesignDocument,
 *   tokenState?: { values, changes, history, updatedAt }
 * }
 * Query (GET): ?projectSlug=<slug>&slug=<designSlug>
 * Query (DELETE): ?projectSlug=<slug>&slug=<designSlug>&confirm=true
 */

const isNotFoundError = (message: string) =>
  /not found|enoent|no such file/i.test(message);

const parseProjectSlug = (value: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const parseSlug = (value: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectSlug: rawProjectSlug, slug, document, tokenState } = body;
    const projectSlug =
      typeof rawProjectSlug === 'string'
        ? parseProjectSlug(rawProjectSlug)
        : undefined;

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid slug' },
        { status: 400 }
      );
    }

    // Validate document structure
    const validated = parseDesignDocument(document);

    if (projectSlug) {
      await saveProjectDesign(projectSlug, slug, validated);
      if (tokenState) {
        await saveProjectTokenState(projectSlug, slug, tokenState);
      }
      try {
        await setProjectActiveDesign(projectSlug, slug);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!isNotFoundError(message)) {
          throw error;
        }
      }
    } else {
      await saveDesign(slug, validated);
    }

    const filePath = projectSlug
      ? getProjectDesignPath(projectSlug, slug)
      : getDesignPath(slug);

    return NextResponse.json({
      saved: true,
      slug,
      projectSlug: projectSlug ?? null,
      filePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = isNotFoundError(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectSlug = parseProjectSlug(url.searchParams.get('projectSlug'));
    const slug = parseSlug(url.searchParams.get('slug'));

    if (slug) {
      if (projectSlug) {
        const { document, dataContext, tokenState, restoredAt } =
          await loadProjectDesignState(projectSlug, slug);
        try {
          await setProjectActiveDesign(projectSlug, slug);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!isNotFoundError(message)) {
            throw error;
          }
        }
        return NextResponse.json({
          loaded: true,
          slug,
          projectSlug,
          document,
          dataContext,
          tokenState,
          restoredAt,
          filePath: getProjectDesignPath(projectSlug, slug),
        });
      }

      const document = await loadDesign(slug);
      return NextResponse.json({
        loaded: true,
        slug,
        projectSlug: null,
        document,
        dataContext: document.data ?? {},
        restoredAt: new Date().toISOString(),
        filePath: getDesignPath(slug),
      });
    }

    const designs = projectSlug
      ? await listProjectDesigns(projectSlug)
      : await listDesigns();

    return NextResponse.json({
      listed: true,
      projectSlug: projectSlug ?? null,
      count: designs.length,
      designs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = isNotFoundError(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const projectSlug = parseProjectSlug(url.searchParams.get('projectSlug'));
    const slug = parseSlug(url.searchParams.get('slug'));
    const confirmed = url.searchParams.get('confirm') === 'true';

    if (!slug) {
      return NextResponse.json(
        { error: 'Missing or invalid slug' },
        { status: 400 }
      );
    }

    if (!confirmed) {
      return NextResponse.json(
        {
          error:
            'Delete confirmation required. Repeat request with confirm=true to delete.',
        },
        { status: 400 }
      );
    }

    if (projectSlug) {
      await deleteProjectDesign(projectSlug, slug, { confirm: true });
    } else {
      await deleteDesign(slug);
    }

    return NextResponse.json({
      deleted: true,
      slug,
      projectSlug: projectSlug ?? null,
      confirmed: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = isNotFoundError(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
