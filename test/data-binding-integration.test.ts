import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DesignDocument } from '@/types/document-model';
import { designDocumentSchema } from '@/types/document-model.schema';
import { useDataContextStore } from '@/lib/stores/data-context';
import { renderDocument, type CompositionOptions } from '@/lib/engine/composition-renderer';
import type { FoundryMcpClient } from '@/lib/mcp/foundry-client';
import {
  executeSetDocument,
  executeSetDataContext,
  type SetDocumentToolArgs,
  type SetDataContextToolArgs,
} from '@/lib/runtime/tools/document-tools';
import { useDocumentStateStore } from '@/lib/stores/document-state';

// ============================================================================
// Helpers
// ============================================================================

/** Create a mock Foundry client that echoes component + props as HTML */
function createMockClient(): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: Record<string, unknown>) => ({
      html: `<div data-component="${schema.component}">${JSON.stringify(schema.props)}</div>`,
      warnings: [],
    })),
    validate: vi.fn(),
    buildTokens: vi.fn(),
  } as unknown as FoundryMcpClient;
}

/** A document with $data.x bindings in component props */
function createBoundDocument(): DesignDocument {
  return {
    metadata: { title: 'Bound Test' },
    root: {
      nodeType: 'layout',
      layout: { type: 'stack' },
      children: [
        {
          nodeType: 'component',
          id: 'heading-1',
          ref: 'oods:Heading',
          props: {
            text: '$data.content.title',
            level: 1,
          },
        },
        {
          nodeType: 'component',
          id: 'card-1',
          ref: 'oods:Card',
          props: {
            title: '$data.content.title',
            color: '$data.theme.primary',
            static: 'always-here',
          },
        },
      ],
    },
    data: {
      content: { title: 'Hello World' },
      theme: { primary: '#3b82f6' },
    },
  };
}

// ============================================================================
// Schema Validation
// ============================================================================

describe('DesignDocument.data field validation', () => {
  it('accepts document with data field', async () => {
    const doc = createBoundDocument();
    const result = designDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it('accepts document without data field', async () => {
    const doc: DesignDocument = {
      metadata: { title: 'No Data' },
      root: {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:Button',
        props: { label: 'Click' },
      },
    };
    const result = designDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it('accepts document with empty data object', async () => {
    const doc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:Button',
        props: {},
      },
      data: {},
    };
    const result = designDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Data Context Store
// ============================================================================

describe('useDataContextStore', () => {
  beforeEach(() => {
    useDataContextStore.getState().reset();
  });

  it('starts with empty context', async () => {
    expect(useDataContextStore.getState().context).toEqual({});
    expect(useDataContextStore.getState().revision).toBe(0);
  });

  it('setContext replaces entire context', async () => {
    useDataContextStore.getState().setContext({ colors: { primary: '#fff' } });
    expect(useDataContextStore.getState().context).toEqual({
      colors: { primary: '#fff' },
    });
    expect(useDataContextStore.getState().revision).toBe(1);
  });

  it('mergeContext merges into existing context', async () => {
    useDataContextStore.getState().setContext({ a: 1 });
    useDataContextStore.getState().mergeContext({ b: 2 });
    expect(useDataContextStore.getState().context).toEqual({ a: 1, b: 2 });
    expect(useDataContextStore.getState().revision).toBe(2);
  });

  it('getContext returns current context', async () => {
    useDataContextStore.getState().setContext({ x: 'y' });
    expect(useDataContextStore.getState().getContext()).toEqual({ x: 'y' });
  });

  it('reset clears context and revision', async () => {
    useDataContextStore.getState().setContext({ x: 1 });
    useDataContextStore.getState().reset();
    expect(useDataContextStore.getState().context).toEqual({});
    expect(useDataContextStore.getState().revision).toBe(0);
  });
});

// ============================================================================
// Composition Renderer — Binding Resolution
// ============================================================================

describe('composition renderer with data bindings', () => {
  it('resolves bindings from document.data before OODS dispatch', async () => {
    const client = createMockClient();
    const doc = createBoundDocument();

    const result = await renderDocument(doc, client);

    expect(result.errors).toHaveLength(0);

    // The mock client echoes props — verify bindings were resolved
    const renderCalls = (client.render as ReturnType<typeof vi.fn>).mock.calls;
    expect(renderCalls).toHaveLength(2);

    // First component: Heading
    const headingSchema = renderCalls[0][0];
    expect(headingSchema.component).toBe('Heading');
    expect(headingSchema.props.text).toBe('Hello World');
    expect(headingSchema.props.level).toBe(1); // static value unchanged

    // Second component: Card
    const cardSchema = renderCalls[1][0];
    expect(cardSchema.component).toBe('Card');
    expect(cardSchema.props.title).toBe('Hello World');
    expect(cardSchema.props.color).toBe('#3b82f6');
    expect(cardSchema.props.static).toBe('always-here');
  });

  it('resolves bindings from options.dataContext', async () => {
    const client = createMockClient();
    const doc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:Button',
        props: { label: '$data.label' },
      },
    };

    const options: CompositionOptions = {
      dataContext: { label: 'Click Me' },
    };

    await renderDocument(doc, client, options);

    const renderCalls = (client.render as ReturnType<typeof vi.fn>).mock.calls;
    expect(renderCalls[0][0].props.label).toBe('Click Me');
  });

  it('options.dataContext overrides document.data for same keys', async () => {
    const client = createMockClient();
    const doc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:Button',
        props: { label: '$data.text' },
      },
      data: { text: 'from-doc' },
    };

    await renderDocument(doc, client, { dataContext: { text: 'from-options' } });

    const renderCalls = (client.render as ReturnType<typeof vi.fn>).mock.calls;
    expect(renderCalls[0][0].props.label).toBe('from-options');
  });

  it('surfaces missing-path binding errors with clear messages', async () => {
    const client = createMockClient();
    const doc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'component',
        id: 'badge-1',
        ref: 'oods:Badge',
        props: { text: '$data.content.subtitle' },
      },
      data: { content: { title: 'Known title' } },
    };

    const result = await renderDocument(doc, client);

    expect((client.render as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].componentId).toBe('badge-1');
    expect(result.errors[0].message).toContain(
      'Missing data path "$data.content.subtitle"'
    );
    expect(result.html).toContain('data-component-error="true"');
  });

  it('surfaces type-mismatch binding errors while still rendering valid components', async () => {
    const client = createMockClient();
    const doc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'layout',
        layout: { type: 'stack' },
        children: [
          {
            nodeType: 'component',
            id: 'ok-1',
            ref: 'oods:Heading',
            props: { text: '$data.content.title' },
          },
          {
            nodeType: 'component',
            id: 'bad-1',
            ref: 'oods:Badge',
            props: { text: '$data.content.title.value' },
          },
        ],
      },
      data: { content: { title: 'Hello' } },
    };

    const result = await renderDocument(doc, client);
    const renderCalls = (client.render as ReturnType<typeof vi.fn>).mock.calls;

    expect(renderCalls).toHaveLength(1);
    expect(renderCalls[0][0].component).toBe('Heading');
    expect(renderCalls[0][0].props.text).toBe('Hello');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].componentId).toBe('bad-1');
    expect(result.errors[0].message).toContain(
      'Type mismatch while resolving "$data.content.title.value"'
    );
    expect(result.html).toContain('data-component-id="ok-1"');
    expect(result.html).toContain('data-component-error="true"');
  });

  it('passes props through unchanged when no data context', async () => {
    const client = createMockClient();
    const doc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:Button',
        props: { label: '$data.missing', variant: 'primary' },
      },
    };

    await renderDocument(doc, client);

    const renderCalls = (client.render as ReturnType<typeof vi.fn>).mock.calls;
    // No data context → bindings passed through as-is
    expect(renderCalls[0][0].props.label).toBe('$data.missing');
    expect(renderCalls[0][0].props.variant).toBe('primary');
  });
});

// ============================================================================
// Document Tools — set_document with data
// ============================================================================

describe('set_document tool with data context', () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    useDataContextStore.getState().reset();
  });

  it('set_document with data parameter updates data context store', async () => {
    const args: SetDocumentToolArgs = {
      requestId: 'test-1',
      document: {
        metadata: { title: 'Test' },
        root: {
          nodeType: 'component',
          id: 'btn-1',
          ref: 'oods:Button',
          props: { label: '$data.text' },
        },
      },
      data: { text: 'Hello' },
    };

    const result = await executeSetDocument(args);

    expect(result.saved).toBe(true);
    expect(useDocumentStateStore.getState().document).not.toBeNull();
    expect(useDataContextStore.getState().context).toEqual({ text: 'Hello' });
  });

  it('set_document without data parameter does not clear data context', async () => {
    useDataContextStore.getState().setContext({ existing: true });

    const args: SetDocumentToolArgs = {
      requestId: 'test-2',
      document: {
        metadata: {},
        root: {
          nodeType: 'component',
          id: 'btn-1',
          ref: 'oods:Button',
          props: {},
        },
      },
    };

    await executeSetDocument(args);
    expect(useDataContextStore.getState().context).toEqual({ existing: true });
  });
});

// ============================================================================
// set_data_context Tool
// ============================================================================

describe('set_data_context tool', () => {
  beforeEach(() => {
    useDataContextStore.getState().reset();
  });

  it('replaces data context', async () => {
    const args: SetDataContextToolArgs = {
      requestId: 'ctx-1',
      data: { colors: { primary: '#f00' } },
    };

    const result = executeSetDataContext(args);

    expect(result.updated).toBe(true);
    expect(result.keyCount).toBe(1);
    expect(useDataContextStore.getState().context).toEqual({
      colors: { primary: '#f00' },
    });
  });

  it('merges data context when merge=true', async () => {
    useDataContextStore.getState().setContext({ a: 1 });

    const args: SetDataContextToolArgs = {
      requestId: 'ctx-2',
      data: { b: 2 },
      merge: true,
    };

    const result = executeSetDataContext(args);

    expect(result.updated).toBe(true);
    expect(result.keyCount).toBe(2);
    expect(useDataContextStore.getState().context).toEqual({ a: 1, b: 2 });
  });

  it('returns error for missing data', async () => {
    const result = executeSetDataContext({
      requestId: 'ctx-3',
      data: null as unknown as Record<string, unknown>,
    });

    expect(result.updated).toBe(false);
    expect(result.errors).toContain('No data object provided.');
  });
});
