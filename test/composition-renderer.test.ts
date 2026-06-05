/**
 * Composition Renderer Tests
 *
 * Integration tests for the two-phase composition renderer.
 * Uses mock OODS clients to verify tree traversal, parallel rendering,
 * error handling, and final HTML composition.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  DesignDocument,
  DesignNode,
  LayoutNode,
  ComponentNode,
} from '../src/types/document-model';
import type { FoundryMcpClient, FoundryRenderOutput } from '../src/lib/mcp/foundry-client';
import {
  renderDocument,
  renderNode,
  collectComponents,
} from '../src/lib/engine/composition-renderer';
import type {
  CompositionResult,
  ComponentRenderResult,
} from '../src/lib/engine/composition-renderer';

// ============================================================================
// Mock OODS Client Factory
// ============================================================================

/**
 * Create a mock FoundryMcpClient that returns HTML based on component name.
 */
function createMockClient(
  overrides: Partial<FoundryMcpClient> = {},
): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string; props?: Record<string, unknown> };
      const name = s.component ?? 'Unknown';
      return {
        html: `<div class="${name.toLowerCase()}">${name} rendered</div>`,
        warnings: [],
        raw: schema,
      } satisfies FoundryRenderOutput;
    }),
    validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
    buildTokens: vi.fn(async () => ({ raw: null })),
    ...overrides,
  };
}

/**
 * Create a mock client that fails for specific component IDs.
 */
function createFailingClient(
  failingIds: Set<string>,
): FoundryMcpClient {
  return createMockClient({
    render: vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string; props?: Record<string, unknown> };
      const name = s.component ?? 'Unknown';
      // We need to inspect which component is being rendered.
      // The renderer passes { component, props } — we match on component name.
      if (failingIds.has(name)) {
        throw new Error(`OODS render failed for ${name}`);
      }
      return {
        html: `<div class="${name.toLowerCase()}">${name} rendered</div>`,
        warnings: [],
        raw: schema,
      };
    }),
  });
}

// ============================================================================
// Test Fixtures
// ============================================================================

const SINGLE_COMPONENT: ComponentNode = {
  nodeType: 'component',
  id: 'solo-btn',
  ref: 'oods:Button',
  props: { text: 'Click me' },
};

const SIMPLE_STACK_DOC: DesignDocument = {
  metadata: { title: 'Simple Stack' },
  root: {
    nodeType: 'layout',
    layout: { type: 'stack', gap: 16 },
    children: [
      {
        nodeType: 'component',
        id: 'header',
        ref: 'oods:Header',
        props: { title: 'Hello' },
      },
      {
        nodeType: 'component',
        id: 'body',
        ref: 'oods:Card',
        props: { content: 'Body' },
      },
    ],
  },
};

const NESTED_DOC: DesignDocument = {
  metadata: { title: 'Nested Layout' },
  root: {
    nodeType: 'layout',
    layout: { type: 'stack', gap: 24 },
    children: [
      {
        nodeType: 'component',
        id: 'top-header',
        ref: 'oods:Header',
        props: {},
      },
      {
        nodeType: 'layout',
        layout: { type: 'grid', columns: 3, gap: 16 },
        children: [
          {
            nodeType: 'component',
            id: 'card-1',
            ref: 'oods:Card',
            props: { title: 'Card 1' },
          },
          {
            nodeType: 'component',
            id: 'card-2',
            ref: 'oods:Card',
            props: { title: 'Card 2' },
          },
          {
            nodeType: 'component',
            id: 'card-3',
            ref: 'oods:Card',
            props: { title: 'Card 3' },
          },
        ],
      },
      {
        nodeType: 'component',
        id: 'footer',
        ref: 'oods:Footer',
        props: {},
      },
    ],
  },
};

const DEEPLY_NESTED_DOC: DesignDocument = {
  metadata: { title: 'Deep Nesting' },
  root: {
    nodeType: 'layout',
    layout: { type: 'stack' },
    children: [
      {
        nodeType: 'layout',
        layout: { type: 'grid', columns: 2 },
        children: [
          {
            nodeType: 'layout',
            layout: { type: 'stack', gap: 8 },
            children: [
              {
                nodeType: 'component',
                id: 'deep-a',
                ref: 'oods:Input',
                props: {},
              },
              {
                nodeType: 'component',
                id: 'deep-b',
                ref: 'oods:Button',
                props: {},
              },
            ],
          },
          {
            nodeType: 'component',
            id: 'sidebar',
            ref: 'oods:Sidebar',
            props: {},
          },
        ],
      },
    ],
  },
};

const EMPTY_LAYOUT_DOC: DesignDocument = {
  metadata: { title: 'Empty Layout' },
  root: {
    nodeType: 'layout',
    layout: { type: 'stack' },
    children: [],
  },
};

const SINGLE_COMPONENT_DOC: DesignDocument = {
  metadata: { title: 'Solo Component' },
  root: SINGLE_COMPONENT,
};

// ============================================================================
// Tests: collectComponents
// ============================================================================

describe('collectComponents', () => {
  it('should collect a single component node', () => {
    const result = collectComponents(SINGLE_COMPONENT);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('solo-btn');
  });

  it('should collect components from a flat layout', () => {
    const result = collectComponents(SIMPLE_STACK_DOC.root);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['header', 'body']);
  });

  it('should collect components from nested layouts depth-first', () => {
    const result = collectComponents(NESTED_DOC.root);

    expect(result).toHaveLength(5);
    expect(result.map((c) => c.id)).toEqual([
      'top-header',
      'card-1',
      'card-2',
      'card-3',
      'footer',
    ]);
  });

  it('should collect from deeply nested tree', () => {
    const result = collectComponents(DEEPLY_NESTED_DOC.root);

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.id)).toEqual(['deep-a', 'deep-b', 'sidebar']);
  });

  it('should return empty array for empty layout', () => {
    const result = collectComponents(EMPTY_LAYOUT_DOC.root);

    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// Tests: renderDocument — Basic Composition
// ============================================================================

describe('renderDocument - Basic Composition', () => {
  it('should render a simple stack with two components', async () => {
    const client = createMockClient();
    const result = await renderDocument(SIMPLE_STACK_DOC, client);

    expect(result.html).toContain('data-layout="stack"');
    expect(result.html).toContain('data-component-id="header"');
    expect(result.html).toContain('data-component-id="body"');
    expect(result.html).toContain('Header rendered');
    expect(result.html).toContain('Card rendered');
    expect(result.errors).toHaveLength(0);
    expect(result.components).toHaveLength(2);
  });

  it('should render a document with nested layouts', async () => {
    const client = createMockClient();
    const result = await renderDocument(NESTED_DOC, client);

    // Layout structure
    expect(result.html).toContain('data-layout="stack"');
    expect(result.html).toContain('data-layout="grid"');
    expect(result.html).toContain('repeat(3, 1fr)');

    // All components rendered
    expect(result.html).toContain('data-component-id="top-header"');
    expect(result.html).toContain('data-component-id="card-1"');
    expect(result.html).toContain('data-component-id="card-2"');
    expect(result.html).toContain('data-component-id="card-3"');
    expect(result.html).toContain('data-component-id="footer"');

    expect(result.components).toHaveLength(5);
    expect(result.errors).toHaveLength(0);
  });

  it('should render deeply nested document', async () => {
    const client = createMockClient();
    const result = await renderDocument(DEEPLY_NESTED_DOC, client);

    expect(result.html).toContain('data-component-id="deep-a"');
    expect(result.html).toContain('data-component-id="deep-b"');
    expect(result.html).toContain('data-component-id="sidebar"');
    expect(result.html).toContain('Input rendered');
    expect(result.html).toContain('Button rendered');
    expect(result.html).toContain('Sidebar rendered');
    expect(result.components).toHaveLength(3);
  });

  it('should render empty layout as empty container', async () => {
    const client = createMockClient();
    const result = await renderDocument(EMPTY_LAYOUT_DOC, client);

    expect(result.html).toContain('data-layout="stack"');
    expect(result.components).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should render a document with a single component as root', async () => {
    const client = createMockClient();
    const result = await renderDocument(SINGLE_COMPONENT_DOC, client);

    expect(result.html).toContain('data-component-id="solo-btn"');
    expect(result.html).toContain('Button rendered');
    expect(result.components).toHaveLength(1);
  });
});

// ============================================================================
// Tests: OODS Dispatch & Parallel Rendering
// ============================================================================

describe('renderDocument - OODS Dispatch', () => {
  it('should call OODS render for each ComponentNode', async () => {
    const client = createMockClient();
    await renderDocument(NESTED_DOC, client);

    expect(client.render).toHaveBeenCalledTimes(5);
  });

  it('should pass component name and props to OODS render', async () => {
    const client = createMockClient();
    await renderDocument(SIMPLE_STACK_DOC, client);

    expect(client.render).toHaveBeenCalledWith({
      component: 'Header',
      props: { title: 'Hello' },
    });
    expect(client.render).toHaveBeenCalledWith({
      component: 'Card',
      props: { content: 'Body' },
    });
  });

  it('should strip oods: prefix from component ref', async () => {
    const client = createMockClient();
    const doc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'component',
        id: 'test',
        ref: 'oods:CustomWidget',
        props: {},
      },
    };

    await renderDocument(doc, client);

    expect(client.render).toHaveBeenCalledWith({
      component: 'CustomWidget',
      props: {},
    });
  });

  it('should render all components in parallel (not sequentially)', async () => {
    const renderOrder: string[] = [];
    const resolvers: Array<() => void> = [];

    const client = createMockClient({
      render: vi.fn((schema: unknown) => {
        const s = schema as { component: string };
        return new Promise<FoundryRenderOutput>((resolve) => {
          resolvers.push(() => {
            renderOrder.push(s.component);
            resolve({
              html: `<div>${s.component}</div>`,
              raw: schema,
            });
          });
        });
      }),
    });

    const promise = renderDocument(SIMPLE_STACK_DOC, client);

    // Both render calls should have been made before any resolves
    // Wait a tick for promises to be created
    await new Promise((r) => setTimeout(r, 0));
    expect(resolvers).toHaveLength(2);

    // Resolve in reverse order to prove they're parallel
    resolvers[1]();
    resolvers[0]();

    const result = await promise;
    expect(renderOrder).toEqual(['Card', 'Header']);
    expect(result.html).toContain('Header');
    expect(result.html).toContain('Card');
  });
});

// ============================================================================
// Tests: Error Handling & Graceful Degradation
// ============================================================================

describe('renderDocument - Error Handling', () => {
  it('should gracefully handle a failed component render', async () => {
    const client = createFailingClient(new Set(['Card']));
    const result = await renderDocument(SIMPLE_STACK_DOC, client);

    // Document should still produce HTML
    expect(result.html).toBeTruthy();

    // Header should render successfully
    expect(result.html).toContain('Header rendered');

    // Card should show error fallback
    expect(result.html).toContain('data-component-error="true"');
    expect(result.html).toContain('Render failed');

    // Error recorded
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].componentId).toBe('body');
    expect(result.errors[0].componentRef).toBe('oods:Card');
    expect(result.errors[0].message).toContain('OODS render failed');
  });

  it('should continue rendering when some components fail', async () => {
    const client = createFailingClient(new Set(['Card']));
    const result = await renderDocument(NESTED_DOC, client);

    // Header and Footer should succeed
    expect(result.html).toContain('Header rendered');
    expect(result.html).toContain('Footer rendered');

    // All 3 cards should show errors
    expect(result.errors).toHaveLength(3);
    expect(result.errors.every((e) => e.componentRef === 'oods:Card')).toBe(true);
  });

  it('should handle all components failing', async () => {
    const client = createMockClient({
      render: vi.fn(async () => {
        throw new Error('Total OODS failure');
      }),
    });

    const result = await renderDocument(SIMPLE_STACK_DOC, client);

    // Should still produce layout HTML
    expect(result.html).toContain('data-layout="stack"');
    expect(result.errors).toHaveLength(2);
  });

  it('should escape HTML in error messages', async () => {
    const client = createMockClient({
      render: vi.fn(async () => {
        throw new Error('<script>alert("xss")</script>');
      }),
    });

    const result = await renderDocument(SINGLE_COMPONENT_DOC, client);

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
  });
});

// ============================================================================
// Tests: Component Results Tracking
// ============================================================================

describe('renderDocument - Component Results', () => {
  it('should return results for all components', async () => {
    const client = createMockClient();
    const result = await renderDocument(NESTED_DOC, client);

    expect(result.components).toHaveLength(5);
    const ids = result.components.map((c) => c.id);
    expect(ids).toContain('top-header');
    expect(ids).toContain('card-1');
    expect(ids).toContain('card-2');
    expect(ids).toContain('card-3');
    expect(ids).toContain('footer');
  });

  it('should include rendered HTML in component results', async () => {
    const client = createMockClient();
    const result = await renderDocument(SIMPLE_STACK_DOC, client);

    const headerResult = result.components.find((c) => c.id === 'header');
    expect(headerResult).toBeDefined();
    expect(headerResult!.html).toContain('Header rendered');
    expect(headerResult!.error).toBeUndefined();
  });

  it('should include error in failed component results', async () => {
    const client = createFailingClient(new Set(['Card']));
    const result = await renderDocument(SIMPLE_STACK_DOC, client);

    const cardResult = result.components.find((c) => c.id === 'body');
    expect(cardResult).toBeDefined();
    expect(cardResult!.error).toContain('OODS render failed');
  });

  it('should include warnings from OODS', async () => {
    const client = createMockClient({
      render: vi.fn(async () => ({
        html: '<div>Rendered</div>',
        warnings: ['Deprecated prop used'],
        raw: null,
      })),
    });

    const result = await renderDocument(SINGLE_COMPONENT_DOC, client);

    expect(result.components[0].warnings).toEqual(['Deprecated prop used']);
  });
});

// ============================================================================
// Tests: renderNode (subtree rendering)
// ============================================================================

describe('renderNode - Subtree Rendering', () => {
  it('should render a subtree of the document', async () => {
    const client = createMockClient();
    const subtree: DesignNode = {
      nodeType: 'layout',
      layout: { type: 'grid', columns: 2 },
      children: [
        {
          nodeType: 'component',
          id: 'a',
          ref: 'oods:Button',
          props: {},
        },
        {
          nodeType: 'component',
          id: 'b',
          ref: 'oods:Input',
          props: {},
        },
      ],
    };

    const result = await renderNode(subtree, client);

    expect(result.html).toContain('data-layout="grid"');
    expect(result.html).toContain('Button rendered');
    expect(result.html).toContain('Input rendered');
    expect(result.components).toHaveLength(2);
  });

  it('should render a single component node', async () => {
    const client = createMockClient();
    const result = await renderNode(SINGLE_COMPONENT, client);

    expect(result.html).toContain('data-component-id="solo-btn"');
    expect(result.html).toContain('Button rendered');
    expect(result.components).toHaveLength(1);
  });
});

// ============================================================================
// Tests: Layout Options
// ============================================================================

describe('renderDocument - Composition Options', () => {
  it('should use inline styles by default', async () => {
    const client = createMockClient();
    const result = await renderDocument(SIMPLE_STACK_DOC, client);

    expect(result.html).toContain('style=');
    expect(result.html).toContain('display: flex');
  });

  it('should render with CSS classes when useInlineStyles is false', async () => {
    const client = createMockClient();
    const result = await renderDocument(SIMPLE_STACK_DOC, client, {
      useInlineStyles: false,
    });

    expect(result.html).toContain('class="layout-stack"');
    expect(result.html).not.toContain('style="display: flex');
  });

  it('should support custom class prefix', async () => {
    const client = createMockClient();
    const result = await renderDocument(SIMPLE_STACK_DOC, client, {
      useInlineStyles: false,
      classPrefix: 'ds',
    });

    expect(result.html).toContain('class="ds-stack"');
  });
});

// ============================================================================
// Tests: Depth-First Traversal Order
// ============================================================================

describe('renderDocument - Depth-First Traversal', () => {
  it('should produce HTML with components in depth-first order', async () => {
    const client = createMockClient();
    const result = await renderDocument(NESTED_DOC, client);

    const html = result.html;
    const headerPos = html.indexOf('data-component-id="top-header"');
    const card1Pos = html.indexOf('data-component-id="card-1"');
    const card2Pos = html.indexOf('data-component-id="card-2"');
    const card3Pos = html.indexOf('data-component-id="card-3"');
    const footerPos = html.indexOf('data-component-id="footer"');

    // Depth-first order: header → card-1 → card-2 → card-3 → footer
    expect(headerPos).toBeLessThan(card1Pos);
    expect(card1Pos).toBeLessThan(card2Pos);
    expect(card2Pos).toBeLessThan(card3Pos);
    expect(card3Pos).toBeLessThan(footerPos);
  });

  it('should maintain correct nesting in deeply nested layouts', async () => {
    const client = createMockClient();
    const result = await renderDocument(DEEPLY_NESTED_DOC, client);

    const html = result.html;
    const deepAPos = html.indexOf('data-component-id="deep-a"');
    const deepBPos = html.indexOf('data-component-id="deep-b"');
    const sidebarPos = html.indexOf('data-component-id="sidebar"');

    expect(deepAPos).toBeLessThan(deepBPos);
    expect(deepBPos).toBeLessThan(sidebarPos);
  });
});

// ============================================================================
// Tests: Complete HTML Output Structure
// ============================================================================

describe('renderDocument - Output Structure', () => {
  it('should wrap each component in a container with data attributes', async () => {
    const client = createMockClient();
    const result = await renderDocument(SINGLE_COMPONENT_DOC, client);

    expect(result.html).toContain('data-component-id="solo-btn"');
    expect(result.html).toContain('data-component-ref="oods:Button"');
    // The container wraps the rendered HTML
    expect(result.html).toMatch(
      /data-component-id="solo-btn".*data-component-ref="oods:Button"[^>]*>.*Button rendered/s,
    );
  });

  it('should produce valid nested HTML structure', async () => {
    const client = createMockClient();
    const result = await renderDocument(NESTED_DOC, client);

    // Outer stack contains inner grid
    expect(result.html).toContain('data-layout="stack"');
    expect(result.html).toContain('data-layout="grid"');

    // Grid is inside stack (grid div appears after stack opening tag)
    const stackStart = result.html.indexOf('data-layout="stack"');
    const gridStart = result.html.indexOf('data-layout="grid"');
    expect(gridStart).toBeGreaterThan(stackStart);
  });
});
