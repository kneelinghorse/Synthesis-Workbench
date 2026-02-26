/**
 * Document Model Unit Tests
 *
 * Comprehensive tests for document model types and validation schemas.
 * Tests parsing, validation, and error handling for design documents.
 */

import { describe, it, expect } from 'vitest';
import type {
  DesignDocument,
  LayoutNode,
  ComponentNode,
  DesignNode,
} from '../src/types/document-model';
import {
  isLayoutNode,
  isComponentNode,
  isStackLayout,
  isGridLayout,
} from '../src/types/document-model';
import {
  parseDesignDocument,
  safeParseDesignDocument,
  parseDesignNode,
  safeParseDesignNode,
  parseComponentRef,
  isValidComponentRef,
} from '../src/types/document-model.schema';

// ============================================================================
// Sample Documents
// ============================================================================

describe('Document Model Schema', () => {
  describe('ComponentNode Validation', () => {
    it('should parse valid component node', () => {
      const validComponent = {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:Button',
        props: {
          text: 'Click me',
          variant: 'primary',
        },
      };

      const result = parseDesignNode(validComponent);
      expect(result).toEqual(validComponent);
      expect(isComponentNode(result)).toBe(true);
    });

    it('should reject component without id', () => {
      const invalid = {
        nodeType: 'component',
        ref: 'oods:Button',
        props: {},
      };

      expect(() => parseDesignNode(invalid)).toThrow();
    });

    it('should reject invalid component ref format', () => {
      const invalid = {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'Button', // Missing "oods:" prefix
        props: {},
      };

      expect(() => parseDesignNode(invalid)).toThrow();
    });

    it('should reject component ref with lowercase first letter', () => {
      const invalid = {
        nodeType: 'component',
        id: 'btn-1',
        ref: 'oods:button', // Should be capitalized
        props: {},
      };

      expect(() => parseDesignNode(invalid)).toThrow();
    });

    it('should accept component with complex props', () => {
      const component = {
        nodeType: 'component',
        id: 'card-1',
        ref: 'oods:Card',
        props: {
          title: 'My Card',
          nested: {
            value: 42,
            enabled: true,
          },
          items: ['a', 'b', 'c'],
        },
      };

      const result = parseDesignNode(component);
      expect(result).toEqual(component);
    });
  });

  describe('LayoutNode Validation', () => {
    it('should parse stack layout with children', () => {
      const stackLayout: LayoutNode = {
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

      const result = parseDesignNode(stackLayout);
      expect(result).toEqual(stackLayout);
      expect(isLayoutNode(result)).toBe(true);
      if (isLayoutNode(result)) {
        expect(isStackLayout(result.layout)).toBe(true);
      }
    });

    it('should parse grid layout with children', () => {
      const gridLayout: LayoutNode = {
        nodeType: 'layout',
        layout: {
          type: 'grid',
          columns: 2,
          gap: '1rem',
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

      const result = parseDesignNode(gridLayout);
      expect(result).toEqual(gridLayout);
      expect(isLayoutNode(result)).toBe(true);
      if (isLayoutNode(result)) {
        expect(isGridLayout(result.layout)).toBe(true);
      }
    });

    it('should parse empty layout node', () => {
      const emptyLayout: LayoutNode = {
        nodeType: 'layout',
        layout: {
          type: 'stack',
        },
        children: [],
      };

      const result = parseDesignNode(emptyLayout);
      expect(result).toEqual(emptyLayout);
    });

    it('should parse nested layouts', () => {
      const nestedLayout: LayoutNode = {
        nodeType: 'layout',
        layout: {
          type: 'stack',
          gap: 24,
        },
        children: [
          {
            nodeType: 'layout',
            layout: {
              type: 'grid',
              columns: 3,
            },
            children: [
              {
                nodeType: 'component',
                id: 'item-1',
                ref: 'oods:Card',
                props: {},
              },
              {
                nodeType: 'component',
                id: 'item-2',
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

      const result = parseDesignNode(nestedLayout);
      expect(result).toEqual(nestedLayout);
    });
  });

  describe('DesignDocument Validation', () => {
    it('should parse minimal valid document', () => {
      const minimalDoc: DesignDocument = {
        metadata: {},
        root: {
          nodeType: 'component',
          id: 'root',
          ref: 'oods:App',
          props: {},
        },
      };

      const result = parseDesignDocument(minimalDoc);
      expect(result).toEqual(minimalDoc);
    });

    it('should parse document with full metadata', () => {
      const fullDoc: DesignDocument = {
        metadata: {
          title: 'My Design',
          description: 'A test design document',
          author: 'Test User',
          version: '1.0.0',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          tags: ['test', 'sample'],
        },
        root: {
          nodeType: 'component',
          id: 'root',
          ref: 'oods:App',
          props: {},
        },
      };

      const result = parseDesignDocument(fullDoc);
      expect(result).toEqual(fullDoc);
      expect(result.metadata.title).toBe('My Design');
      expect(result.metadata.tags).toEqual(['test', 'sample']);
    });

    it('should parse complex multi-component document', () => {
      const complexDoc: DesignDocument = {
        metadata: {
          title: 'Dashboard Layout',
          description: 'Multi-component dashboard with grid and stack layouts',
        },
        root: {
          nodeType: 'layout',
          layout: {
            type: 'stack',
            gap: 32,
          },
          children: [
            {
              nodeType: 'component',
              id: 'header',
              ref: 'oods:Header',
              props: {
                title: 'Dashboard',
                showNav: true,
              },
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
                  props: {
                    title: 'Metric 1',
                    value: 42,
                  },
                },
                {
                  nodeType: 'component',
                  id: 'card-2',
                  ref: 'oods:Card',
                  props: {
                    title: 'Metric 2',
                    value: 84,
                  },
                },
                {
                  nodeType: 'component',
                  id: 'card-3',
                  ref: 'oods:Card',
                  props: {
                    title: 'Metric 3',
                    value: 126,
                  },
                },
              ],
            },
            {
              nodeType: 'component',
              id: 'footer',
              ref: 'oods:Footer',
              props: {
                year: 2024,
              },
            },
          ],
        },
      };

      const result = parseDesignDocument(complexDoc);
      expect(result).toEqual(complexDoc);
      expect(isLayoutNode(result.root)).toBe(true);

      const root = result.root as LayoutNode;
      expect(root.children).toHaveLength(3);
      expect(isComponentNode(root.children[0])).toBe(true);
      expect(isLayoutNode(root.children[1])).toBe(true);
      expect(isComponentNode(root.children[2])).toBe(true);

      const gridSection = root.children[1] as LayoutNode;
      expect(gridSection.children).toHaveLength(3);
      expect(isGridLayout(gridSection.layout)).toBe(true);
    });

    it('should reject document without root', () => {
      const invalid = {
        metadata: {},
      };

      expect(() => parseDesignDocument(invalid)).toThrow();
    });

    it('should reject document with invalid root node', () => {
      const invalid = {
        metadata: {},
        root: {
          nodeType: 'invalid',
        },
      };

      expect(() => parseDesignDocument(invalid)).toThrow();
    });
  });

  describe('Safe Parsing', () => {
    it('should return success for valid document', () => {
      const validDoc: DesignDocument = {
        metadata: {},
        root: {
          nodeType: 'component',
          id: 'root',
          ref: 'oods:App',
          props: {},
        },
      };

      const result = safeParseDesignDocument(validDoc);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validDoc);
      }
    });

    it('should return error for invalid document', () => {
      const invalid = {
        metadata: {},
        root: {
          nodeType: 'component',
          id: 'root',
          // Missing ref
          props: {},
        },
      };

      const result = safeParseDesignDocument(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should return success for valid node', () => {
      const validNode: ComponentNode = {
        nodeType: 'component',
        id: 'test',
        ref: 'oods:Test',
        props: {},
      };

      const result = safeParseDesignNode(validNode);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid node', () => {
      const invalid = {
        nodeType: 'unknown',
      };

      const result = safeParseDesignNode(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Component Reference Validation', () => {
    it('should accept valid component references', () => {
      const validRefs = [
        'oods:Button',
        'oods:Card',
        'oods:Header',
        'oods:Footer',
        'oods:MyCustomComponent',
        'oods:Component123',
      ];

      validRefs.forEach((ref) => {
        expect(() => parseComponentRef(ref)).not.toThrow();
        expect(isValidComponentRef(ref)).toBe(true);
      });
    });

    it('should reject invalid component references', () => {
      const invalidRefs = [
        'Button', // Missing oods: prefix
        'oods:button', // Lowercase first letter
        'oods:', // Missing component name
        'oods:123Button', // Starts with number
        'oods:my-component', // Contains hyphen
        'custom:Button', // Wrong prefix
      ];

      invalidRefs.forEach((ref) => {
        expect(() => parseComponentRef(ref)).toThrow();
        expect(isValidComponentRef(ref)).toBe(false);
      });
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify layout nodes', () => {
      const layout: DesignNode = {
        nodeType: 'layout',
        layout: { type: 'stack' },
        children: [],
      };

      expect(isLayoutNode(layout)).toBe(true);
      expect(isComponentNode(layout)).toBe(false);
    });

    it('should correctly identify component nodes', () => {
      const component: DesignNode = {
        nodeType: 'component',
        id: 'test',
        ref: 'oods:Test',
        props: {},
      };

      expect(isComponentNode(component)).toBe(true);
      expect(isLayoutNode(component)).toBe(false);
    });

    it('should correctly identify stack layouts', () => {
      const stackNode: LayoutNode = {
        nodeType: 'layout',
        layout: { type: 'stack', gap: 16 },
        children: [],
      };

      expect(isStackLayout(stackNode.layout)).toBe(true);
      expect(isGridLayout(stackNode.layout)).toBe(false);
    });

    it('should correctly identify grid layouts', () => {
      const gridNode: LayoutNode = {
        nodeType: 'layout',
        layout: { type: 'grid', columns: 2 },
        children: [],
      };

      expect(isGridLayout(gridNode.layout)).toBe(true);
      expect(isStackLayout(gridNode.layout)).toBe(false);
    });
  });

  describe('Round-trip Serialization', () => {
    it('should survive JSON round-trip', () => {
      const original: DesignDocument = {
        metadata: {
          title: 'Test Document',
          version: '1.0.0',
        },
        root: {
          nodeType: 'layout',
          layout: {
            type: 'stack',
            gap: 16,
          },
          children: [
            {
              nodeType: 'component',
              id: 'btn',
              ref: 'oods:Button',
              props: { text: 'Click' },
            },
          ],
        },
      };

      const json = JSON.stringify(original);
      const parsed = JSON.parse(json);
      const validated = parseDesignDocument(parsed);

      expect(validated).toEqual(original);
    });

    it('should maintain deeply nested structure through round-trip', () => {
      const original: DesignDocument = {
        metadata: {},
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
                  layout: { type: 'stack' },
                  children: [
                    {
                      nodeType: 'component',
                      id: 'deep',
                      ref: 'oods:Deep',
                      props: { level: 3 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const json = JSON.stringify(original);
      const parsed = JSON.parse(json);
      const validated = parseDesignDocument(parsed);

      expect(validated).toEqual(original);
    });
  });
});
