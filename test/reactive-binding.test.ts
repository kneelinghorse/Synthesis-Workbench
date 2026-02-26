import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDataContextStore } from '@/lib/stores/data-context';
import { useDocumentStateStore } from '@/lib/stores/document-state';
import { renderDocument, type CompositionOptions } from '@/lib/engine/composition-renderer';
import type { FoundryMcpClient } from '@/lib/mcp/foundry-client';
import type { DesignDocument } from '@/types/document-model';
import {
  PREVIEW_MESSAGE_TYPES,
  createDataContextUpdateMessage,
  isPreviewMessage,
  type DataContextUpdateMessage,
} from '@/lib/preview/message-types';

// ============================================================================
// Helpers
// ============================================================================

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

function createDocWithBindings(): DesignDocument {
  return {
    metadata: { title: 'Reactive Test' },
    root: {
      nodeType: 'layout',
      layout: { type: 'stack' },
      children: [
        {
          nodeType: 'component',
          id: 'bound-1',
          ref: 'oods:Text',
          props: { content: '$data.message' },
        },
        {
          nodeType: 'component',
          id: 'static-1',
          ref: 'oods:Button',
          props: { label: 'Click me' },
        },
      ],
    },
  };
}

// ============================================================================
// DATA_CONTEXT_UPDATE Message Type
// ============================================================================

describe('DATA_CONTEXT_UPDATE message type', () => {
  it('is defined in PREVIEW_MESSAGE_TYPES', () => {
    expect(PREVIEW_MESSAGE_TYPES.DATA_CONTEXT_UPDATE).toBe('DATA_CONTEXT_UPDATE');
  });

  it('createDataContextUpdateMessage builds valid message', () => {
    const msg = createDataContextUpdateMessage({ theme: { color: '#f00' } });

    expect(msg.source).toBe('synthesis-workbench-preview');
    expect(msg.type).toBe('DATA_CONTEXT_UPDATE');
    expect(msg.payload.context).toEqual({ theme: { color: '#f00' } });
  });

  it('isPreviewMessage recognizes DATA_CONTEXT_UPDATE', () => {
    const msg = createDataContextUpdateMessage({ x: 1 });
    expect(isPreviewMessage(msg)).toBe(true);
  });
});

// ============================================================================
// Data Context Store — Change Detection
// ============================================================================

describe('data context store change triggers', () => {
  beforeEach(() => {
    useDataContextStore.getState().reset();
    useDocumentStateStore.getState().reset();
  });

  it('revision increments on setContext', () => {
    const initial = useDataContextStore.getState().revision;
    useDataContextStore.getState().setContext({ a: 1 });
    expect(useDataContextStore.getState().revision).toBe(initial + 1);
  });

  it('revision increments on mergeContext', () => {
    useDataContextStore.getState().setContext({ a: 1 });
    const afterSet = useDataContextStore.getState().revision;
    useDataContextStore.getState().mergeContext({ b: 2 });
    expect(useDataContextStore.getState().revision).toBe(afterSet + 1);
  });

  it('subscribe fires on context changes', () => {
    const revisions: number[] = [];
    const unsub = useDataContextStore.subscribe((state) => {
      revisions.push(state.revision);
    });

    useDataContextStore.getState().setContext({ x: 1 });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toBe(1);

    useDataContextStore.getState().mergeContext({ y: 2 });
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toBe(2);

    unsub();
  });
});

// ============================================================================
// Composition Re-renders with Updated Data Context
// ============================================================================

describe('composition re-triggers on data context changes', () => {
  it('re-renders with updated data context values', async () => {
    const client = createMockClient();
    const doc = createDocWithBindings();

    // First render with initial context
    await renderDocument(doc, client, {
      dataContext: { message: 'Initial' },
    });

    const call1Props = (client.render as ReturnType<typeof vi.fn>).mock.calls[0][0].props;
    expect(call1Props.content).toBe('Initial');

    // Second render with updated context
    (client.render as ReturnType<typeof vi.fn>).mockClear();
    await renderDocument(doc, client, {
      dataContext: { message: 'Updated' },
    });

    const call2Props = (client.render as ReturnType<typeof vi.fn>).mock.calls[0][0].props;
    expect(call2Props.content).toBe('Updated');
  });

  it('static components render unchanged regardless of data context', async () => {
    const client = createMockClient();
    const doc = createDocWithBindings();

    await renderDocument(doc, client, {
      dataContext: { message: 'Hello' },
    });

    // Check the static component (second call) has unchanged props
    const staticProps = (client.render as ReturnType<typeof vi.fn>).mock.calls[1][0].props;
    expect(staticProps.label).toBe('Click me');
  });

  it('renders all components when data context provided', async () => {
    const client = createMockClient();
    const doc = createDocWithBindings();

    const result = await renderDocument(doc, client, {
      dataContext: { message: 'Test' },
    });

    // Both components rendered
    expect(result.components).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect((client.render as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Dual-store subscription integration
// ============================================================================

describe('dual-store subscription pattern', () => {
  beforeEach(() => {
    useDataContextStore.getState().reset();
    useDocumentStateStore.getState().reset();
  });

  it('both stores have independent revision counters', () => {
    useDocumentStateStore.getState().setDocument({
      metadata: {},
      root: { nodeType: 'component', id: 'x', ref: 'oods:X', props: {} },
    });
    const docRev = useDocumentStateStore.getState().revision;

    useDataContextStore.getState().setContext({ a: 1 });
    const dataRev = useDataContextStore.getState().revision;

    expect(docRev).toBe(1);
    expect(dataRev).toBe(1);

    // Combined generation changes when either store changes
    useDataContextStore.getState().mergeContext({ b: 2 });
    const newDataRev = useDataContextStore.getState().revision;
    expect(newDataRev).toBe(2);
    expect(docRev + newDataRev).toBe(3); // Combined generation
  });

  it('document change does not affect data context revision', () => {
    const dataRevBefore = useDataContextStore.getState().revision;
    useDocumentStateStore.getState().setDocument({
      metadata: {},
      root: { nodeType: 'component', id: 'x', ref: 'oods:X', props: {} },
    });
    const dataRevAfter = useDataContextStore.getState().revision;
    expect(dataRevAfter).toBe(dataRevBefore);
  });

  it('data context change does not affect document revision', () => {
    useDocumentStateStore.getState().setDocument({
      metadata: {},
      root: { nodeType: 'component', id: 'x', ref: 'oods:X', props: {} },
    });
    const docRevBefore = useDocumentStateStore.getState().revision;
    useDataContextStore.getState().setContext({ x: 1 });
    const docRevAfter = useDocumentStateStore.getState().revision;
    expect(docRevAfter).toBe(docRevBefore);
  });
});
