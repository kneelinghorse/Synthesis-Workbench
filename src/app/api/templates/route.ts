import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  loadTemplate,
  saveTemplate,
  templateExists,
} from '@/lib/persistence/template-store';
import {
  getBuiltInTemplate,
  resolveBuiltInTemplateSlug,
} from '@/lib/templates/built-in-library';
import {
  createTemplateFromDesign,
  toTemplateSlug,
} from '@/lib/templates/save-as-template';
import { listTemplateCatalog } from '@/lib/templates/template-catalog';
import { parseDesignDocument } from '@/types/document-model.schema';
import {
  templateCategorySchema,
  templateDataShapeSchema,
  templateTokenOverridesSchema,
} from '@/types/template-model.schema';

const toOptionalStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.filter((entry): entry is string => typeof entry === 'string');
  return normalized.length > 0 ? normalized : undefined;
};

const parseOptionalSlug = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = parseOptionalSlug(url.searchParams.get('slug'));
    if (slug) {
      const builtInSlug = resolveBuiltInTemplateSlug(slug);
      if (builtInSlug) {
        const template = getBuiltInTemplate(builtInSlug);
        return NextResponse.json({
          loaded: true,
          source: 'built-in',
          slug: builtInSlug,
          template,
        });
      }

      try {
        const template = await loadTemplate(slug);
        return NextResponse.json({
          loaded: true,
          source: 'custom',
          slug,
          template,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 404 });
      }
    }

    const templates = await listTemplateCatalog();
    return NextResponse.json({
      listed: true,
      count: templates.length,
      templates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: 'Missing required field: description' },
        { status: 400 }
      );
    }

    if (body.document === undefined) {
      return NextResponse.json(
        { error: 'Missing required field: document' },
        { status: 400 }
      );
    }

    const document = parseDesignDocument(body.document);
    const category = templateCategorySchema.parse(body.category);

    const tokenOverridesResult = templateTokenOverridesSchema.safeParse(
      body.tokenOverrides ?? undefined
    );
    if (!tokenOverridesResult.success && body.tokenOverrides !== undefined) {
      return NextResponse.json(
        { error: tokenOverridesResult.error.issues[0]?.message ?? 'Invalid tokenOverrides' },
        { status: 400 }
      );
    }

    const dataShapeResult = templateDataShapeSchema.safeParse(
      body.dataShape ?? undefined
    );
    if (!dataShapeResult.success && body.dataShape !== undefined) {
      return NextResponse.json(
        { error: dataShapeResult.error.issues[0]?.message ?? 'Invalid dataShape' },
        { status: 400 }
      );
    }

    const slug = parseOptionalSlug(body.slug) ?? toTemplateSlug(name);
    if (!slug) {
      return NextResponse.json(
        { error: 'Unable to derive a valid template slug from name' },
        { status: 400 }
      );
    }

    if (resolveBuiltInTemplateSlug(slug)) {
      return NextResponse.json(
        { error: `Template slug conflicts with built-in template: ${slug}` },
        { status: 409 }
      );
    }

    if (await templateExists(slug)) {
      return NextResponse.json(
        { error: `Template already exists: ${slug}` },
        { status: 409 }
      );
    }

    const template = createTemplateFromDesign(document, {
      name,
      description,
      category,
      previewThumbnail:
        typeof body.previewThumbnail === 'string'
          ? body.previewThumbnail
          : undefined,
      tags: toOptionalStringArray(body.tags),
      tokenOverrides:
        tokenOverridesResult.success ? tokenOverridesResult.data : undefined,
      dataShape: dataShapeResult.success ? dataShapeResult.data : undefined,
    });

    await saveTemplate(slug, template);

    return NextResponse.json({
      saved: true,
      slug,
      source: 'custom',
      metadata: template.metadata,
      requiredComponents: template.requiredComponents ?? [],
      nodeType: template.document.root.nodeType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
