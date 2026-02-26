/**
 * Layout Engine Unit Tests
 *
 * Tests for layout rendering (stack, grid) and tree traversal.
 * Validates HTML/CSS output, nesting, and placeholder generation.
 */

import { describe, it, expect } from 'vitest';
import type { LayoutNode, DesignNode, ComponentNode } from '../src/types/document-model';
import {
  renderTree,
  renderNode,
  renderLayoutNode,
  renderStack,
  renderGrid,
  renderComponentPlaceholder,
  renderWithClasses,
} from '../src/lib/engine/layout-engine';

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_COMPONENT: ComponentNode = {
  nodeType: 'component',
  id: 'test-btn',
  ref: 'oods:Button',
  props: { text: 'Click me' },
};

const STACK_LAYOUT: LayoutNode = {
  nodeType: 'layout',
  layout: {
    type: 'stack',
    gap: 16,
    align: 'center',
  },
  children: [
    {
      nodeType: 'component',
      id: 'btn-1',
      ref: 'oods:Button',
      props: {},
    },
    {
      nodeType: 'component',
      id: 'btn-2',
      ref: 'oods:Button',
      props: {},
    },
  ],
};

const GRID_LAYOUT: LayoutNode = {
  nodeType: 'layout',
  layout: {
    type: 'grid',
    columns: 2,
    gap: 16,
  },
  children: [
    {
      nodeType: 'component',
      id: 'card-1',
      ref: 'oods:Card',
      props: {},
    },
    {
      nodeType: 'component',
      id: 'card-2',
      ref: 'oods:Card',
      props: {},
    },
  ],
};

const NESTED_LAYOUT: LayoutNode = {
  nodeType: 'layout',
  layout: {
    type: 'stack',
    gap: 24,
  },
  children: [
    {
      nodeType: 'component',
      id: 'header',
      ref: 'oods:Header',
      props: {},
    },
    {
      nodeType: 'layout',
      layout: {
        type: 'grid',
        columns: 3,
        gap: 16,
      },
      children: [
        {
          nodeType: 'component',
          id: 'card-1',
          ref: 'oods:Card',
          props: {},
        },
        {
          nodeType: 'component',
          id: 'card-2',
          ref: 'oods:Card',
          props: {},
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
};

// ============================================================================
// Tests
// ============================================================================

describe('Layout Engine - Stack Rendering', () => {
  it('should render basic stack layout', () => {
    const html = renderStack({ type: 'stack' }, ['<div>Child 1</div>', '<div>Child 2</div>']);

    expect(html).toContain('data-layout="stack"');
    expect(html).toContain('display: flex');
    expect(html).toContain('flex-direction: column');
    expect(html).toContain('<div>Child 1</div>');
    expect(html).toContain('<div>Child 2</div>');
  });

  it('should render stack with gap', () => {
    const html = renderStack({ type: 'stack', gap: 16 }, []);

    expect(html).toContain('gap: 16px');
  });

  it('should render stack with string gap', () => {
    const html = renderStack({ type: 'stack', gap: '1rem' }, []);

    expect(html).toContain('gap: 1rem');
  });

  it('should render stack with alignment', () => {
    const html = renderStack({ type: 'stack', align: 'center' }, []);

    expect(html).toContain('align-items: center');
  });

  it('should render stack with justification', () => {
    const html = renderStack({ type: 'stack', justify: 'space-between' }, []);

    expect(html).toContain('justify-content: space-between');
  });

  it('should render stack with all options', () => {
    const html = renderStack(
      { type: 'stack', gap: 24, align: 'end', justify: 'center' },
      ['<div>Child</div>']
    );

    expect(html).toContain('gap: 24px');
    expect(html).toContain('align-items: end');
    expect(html).toContain('justify-content: center');
  });
});

describe('Layout Engine - Grid Rendering', () => {
  it('should render basic grid layout', () => {
    const html = renderGrid({ type: 'grid' }, ['<div>Child 1</div>', '<div>Child 2</div>']);

    expect(html).toContain('data-layout="grid"');
    expect(html).toContain('display: grid');
    expect(html).toContain('<div>Child 1</div>');
    expect(html).toContain('<div>Child 2</div>');
  });

  it('should render grid with numeric columns', () => {
    const html = renderGrid({ type: 'grid', columns: 3 }, []);

    expect(html).toContain('grid-template-columns: repeat(3, 1fr)');
  });

  it('should render grid with custom columns', () => {
    const html = renderGrid({ type: 'grid', columns: '200px 1fr' }, []);

    expect(html).toContain('grid-template-columns: 200px 1fr');
  });

  it('should render grid with rows', () => {
    const html = renderGrid({ type: 'grid', rows: 2 }, []);

    expect(html).toContain('grid-template-rows: repeat(2, auto)');
  });

  it('should render grid with gap', () => {
    const html = renderGrid({ type: 'grid', gap: 16 }, []);

    expect(html).toContain('gap: 16px');
  });

  it('should render grid with column and row gaps', () => {
    const html = renderGrid({ type: 'grid', columnGap: 16, rowGap: 24 }, []);

    expect(html).toContain('column-gap: 16px');
    expect(html).toContain('row-gap: 24px');
  });

  it('should render grid with all options', () => {
    const html = renderGrid(
      {
        type: 'grid',
        columns: 3,
        rows: 2,
        gap: 16,
      },
      []
    );

    expect(html).toContain('grid-template-columns: repeat(3, 1fr)');
    expect(html).toContain('grid-template-rows: repeat(2, auto)');
    expect(html).toContain('gap: 16px');
  });
});

describe('Layout Engine - Component Placeholders', () => {
  it('should render component placeholder', () => {
    const html = renderComponentPlaceholder(SAMPLE_COMPONENT);

    expect(html).toContain('data-component-id="test-btn"');
    expect(html).toContain('data-component-ref="oods:Button"');
    expect(html).toContain('data-placeholder="true"');
  });

  it('should include component ref in placeholder', () => {
    const component: ComponentNode = {
      nodeType: 'component',
      id: 'my-card',
      ref: 'oods:Card',
      props: {},
    };

    const html = renderComponentPlaceholder(component);

    expect(html).toContain('data-component-id="my-card"');
    expect(html).toContain('data-component-ref="oods:Card"');
  });
});

describe('Layout Engine - Node Rendering', () => {
  it('should render LayoutNode with children', () => {
    const html = renderLayoutNode(STACK_LAYOUT, { generatePlaceholders: true });

    expect(html).toContain('data-layout="stack"');
    expect(html).toContain('data-component-id="btn-1"');
    expect(html).toContain('data-component-id="btn-2"');
  });

  it('should render ComponentNode as placeholder when enabled', () => {
    const html = renderNode(SAMPLE_COMPONENT, { generatePlaceholders: true });

    expect(html).toContain('data-component-id="test-btn"');
    expect(html).toContain('data-placeholder="true"');
  });

  it('should return empty string for ComponentNode when placeholders disabled', () => {
    const html = renderNode(SAMPLE_COMPONENT, { generatePlaceholders: false });

    expect(html).toBe('');
  });

  it('should throw error for unknown node type', () => {
    const invalidNode = { nodeType: 'invalid' } as any;

    expect(() => renderNode(invalidNode)).toThrow('Unknown node type');
  });
});

describe('Layout Engine - Nested Layouts', () => {
  it('should render nested layouts (stack with grid)', () => {
    const html = renderTree(NESTED_LAYOUT);

    expect(html).toContain('data-layout="stack"');
    expect(html).toContain('data-layout="grid"');
  });

  it('should render grid inside stack', () => {
    const nestedStack: LayoutNode = {
      nodeType: 'layout',
      layout: { type: 'stack' },
      children: [
        {
          nodeType: 'layout',
          layout: { type: 'grid', columns: 2 },
          children: [],
        },
      ],
    };

    const html = renderTree(nestedStack);

    expect(html).toContain('data-layout="stack"');
    expect(html).toContain('data-layout="grid"');
    expect(html).toContain('repeat(2, 1fr)');
  });

  it('should render stack inside grid', () => {
    const nestedGrid: LayoutNode = {
      nodeType: 'layout',
      layout: { type: 'grid', columns: 2 },
      children: [
        {
          nodeType: 'layout',
          layout: { type: 'stack', gap: 8 },
          children: [],
        },
      ],
    };

    const html = renderTree(nestedGrid);

    expect(html).toContain('data-layout="grid"');
    expect(html).toContain('data-layout="stack"');
    expect(html).toContain('gap: 8px');
  });

  it('should render deeply nested layouts', () => {
    const deepNested: LayoutNode = {
      nodeType: 'layout',
      layout: { type: 'stack' },
      children: [
        {
          nodeType: 'layout',
          layout: { type: 'grid', columns: 2 },
          children: [
            {
              nodeType: 'layout',
              layout: { type: 'stack' },
              children: [
                {
                  nodeType: 'component',
                  id: 'deep-component',
                  ref: 'oods:Deep',
                  props: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const html = renderTree(deepNested);

    expect(html).toContain('data-component-id="deep-component"');

    // Count occurrences of each layout type
    const stackCount = (html.match(/data-layout="stack"/g) || []).length;
    const gridCount = (html.match(/data-layout="grid"/g) || []).length;

    expect(stackCount).toBe(2);
    expect(gridCount).toBe(1);
  });
});

describe('Layout Engine - Tree Rendering', () => {
  it('should render complete tree with default options', () => {
    const html = renderTree(STACK_LAYOUT);

    expect(html).toBeTruthy();
    expect(html).toContain('data-layout="stack"');
    expect(html).toContain('data-component-id');
  });

  it('should render tree with inline styles by default', () => {
    const html = renderTree(STACK_LAYOUT);

    expect(html).toContain('style=');
    expect(html).toContain('display: flex');
  });

  it('should render complex tree', () => {
    const html = renderTree(NESTED_LAYOUT);

    expect(html).toContain('data-component-id="header"');
    expect(html).toContain('data-component-id="card-1"');
    expect(html).toContain('data-component-id="card-2"');
    expect(html).toContain('data-component-id="footer"');
  });

  it('should throw error for invalid layout type', () => {
    const invalidLayout: LayoutNode = {
      nodeType: 'layout',
      layout: { type: 'invalid' } as any,
      children: [],
    };

    expect(() => renderTree(invalidLayout)).toThrow('Unknown layout type');
  });
});

describe('Layout Engine - CSS Classes', () => {
  it('should render with CSS classes instead of inline styles', () => {
    const result = renderWithClasses(STACK_LAYOUT);

    expect(result.html).toContain('class="layout-stack"');
    expect(result.html).not.toContain('style=');
    expect(result.css).toContain('.layout-stack');
    expect(result.css).toContain('display: flex');
  });

  it('should generate CSS for both stack and grid', () => {
    const result = renderWithClasses(GRID_LAYOUT);

    expect(result.css).toContain('.layout-stack');
    expect(result.css).toContain('.layout-grid');
    expect(result.css).toContain('display: grid');
  });

  it('should support custom class prefix', () => {
    const result = renderWithClasses(STACK_LAYOUT, { classPrefix: 'custom' });

    expect(result.html).toContain('class="custom-stack"');
    expect(result.css).toContain('.custom-stack');
  });
});

describe('Layout Engine - Edge Cases', () => {
  it('should handle empty children array', () => {
    const emptyStack: LayoutNode = {
      nodeType: 'layout',
      layout: { type: 'stack' },
      children: [],
    };

    const html = renderTree(emptyStack);

    expect(html).toContain('data-layout="stack"');
  });

  it('should handle component node as root', () => {
    const html = renderTree(SAMPLE_COMPONENT);

    expect(html).toContain('data-component-id="test-btn"');
  });

  it('should handle mixed children (layout and component)', () => {
    const mixed: LayoutNode = {
      nodeType: 'layout',
      layout: { type: 'stack' },
      children: [
        {
          nodeType: 'component',
          id: 'comp-1',
          ref: 'oods:Button',
          props: {},
        },
        {
          nodeType: 'layout',
          layout: { type: 'grid', columns: 2 },
          children: [],
        },
        {
          nodeType: 'component',
          id: 'comp-2',
          ref: 'oods:Card',
          props: {},
        },
      ],
    };

    const html = renderTree(mixed);

    expect(html).toContain('data-component-id="comp-1"');
    expect(html).toContain('data-layout="grid"');
    expect(html).toContain('data-component-id="comp-2"');
  });
});
