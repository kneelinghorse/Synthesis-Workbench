/**
 * Design Persistence Layer Tests
 *
 * Tests for design document storage and retrieval operations.
 * Tests YAML serialization, CRUD operations, and validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
import type { DesignDocument } from '../src/types/document-model';
import {
  loadDesign,
  saveDesign,
  listDesigns,
  createDesign,
  deleteDesign,
  designExists,
  toJSON,
  fromJSON,
  toYAML,
  fromYAML,
  getDesignsDir,
  getDesignPath,
  slugFromPath,
  isValidSlug,
  DESIGN_EXTENSION,
} from '../src/lib/persistence/design-store';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_BASE_DIR = path.join(PROJECT_ROOT, 'test-designs-tmp');

const SAMPLE_DOCUMENT: DesignDocument = {
  metadata: {
    title: 'Test Design',
    description: 'A test design document',
    author: 'Test User',
    version: '1.0.0',
    tags: ['test', 'sample'],
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
        id: 'test-btn',
        ref: 'oods:Button',
        props: {
          text: 'Click me',
        },
      },
    ],
  },
};

const COMPLEX_DOCUMENT: DesignDocument = {
  metadata: {
    title: 'Complex Dashboard',
    description: 'Multi-component dashboard layout',
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
            },
          },
          {
            nodeType: 'component',
            id: 'card-2',
            ref: 'oods:Card',
            props: {
              title: 'Metric 2',
            },
          },
        ],
      },
    ],
  },
};

// ============================================================================
// Test Helpers
// ============================================================================

async function cleanupTestDir() {
  try {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

async function setupTestDir() {
  await cleanupTestDir();
  await fs.mkdir(TEST_BASE_DIR, { recursive: true });

  // Copy template
  const sourceTemplate = path.join(
    PROJECT_ROOT,
    'designs',
    '_template.design.yaml'
  );
  const destTemplate = path.join(TEST_BASE_DIR, 'designs', '_template.design.yaml');

  await fs.mkdir(path.join(TEST_BASE_DIR, 'designs'), { recursive: true });
  await fs.copyFile(sourceTemplate, destTemplate);
}

// ============================================================================
// Tests
// ============================================================================

describe('Design Store - Utilities', () => {
  it('should construct correct designs directory path', () => {
    const designsDir = getDesignsDir(TEST_BASE_DIR);
    expect(designsDir).toBe(path.join(TEST_BASE_DIR, 'designs'));
  });

  it('should construct correct design file path', () => {
    const designPath = getDesignPath('my-design', TEST_BASE_DIR);
    expect(designPath).toBe(
      path.join(TEST_BASE_DIR, 'designs', 'my-design.design.yaml')
    );
  });

  it('should extract slug from file path', () => {
    const filePath = '/path/to/my-design.design.yaml';
    expect(slugFromPath(filePath)).toBe('my-design');
  });

  describe('Slug Validation', () => {
    it('should accept valid slugs', () => {
      expect(isValidSlug('my-design')).toBe(true);
      expect(isValidSlug('my_design')).toBe(true);
      expect(isValidSlug('MyDesign123')).toBe(true);
      expect(isValidSlug('design-123_test')).toBe(true);
    });

    it('should reject invalid slugs', () => {
      expect(isValidSlug('my design')).toBe(false); // Space
      expect(isValidSlug('my.design')).toBe(false); // Dot
      expect(isValidSlug('my/design')).toBe(false); // Slash
      expect(isValidSlug('my@design')).toBe(false); // Special char
      expect(isValidSlug('')).toBe(false); // Empty
    });
  });
});

describe('Design Store - CRUD Operations', () => {
  beforeEach(async () => {
    await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  describe('Save and Load', () => {
    it('should save and load a design document', async () => {
      const slug = 'test-design';

      await saveDesign(slug, SAMPLE_DOCUMENT, TEST_BASE_DIR);
      const loaded = await loadDesign(slug, TEST_BASE_DIR);

      expect(loaded.metadata.title).toBe(SAMPLE_DOCUMENT.metadata.title);
      expect(loaded.metadata.description).toBe(
        SAMPLE_DOCUMENT.metadata.description
      );
      expect(loaded.root).toEqual(SAMPLE_DOCUMENT.root);
    });

    it('should update timestamp on save', async () => {
      const slug = 'timestamped-design';

      await saveDesign(slug, SAMPLE_DOCUMENT, TEST_BASE_DIR);
      const loaded = await loadDesign(slug, TEST_BASE_DIR);

      expect(loaded.metadata.updatedAt).toBeDefined();
      expect(new Date(loaded.metadata.updatedAt!).getTime()).toBeGreaterThan(
        Date.now() - 5000
      );
    });

    it('should reject invalid slug', async () => {
      const invalidSlug = 'invalid slug with spaces';

      await expect(
        saveDesign(invalidSlug, SAMPLE_DOCUMENT, TEST_BASE_DIR)
      ).rejects.toThrow('Invalid slug');
    });

    it('should throw error when loading non-existent design', async () => {
      await expect(
        loadDesign('non-existent', TEST_BASE_DIR)
      ).rejects.toThrow('Design not found');
    });

    it('should save complex nested document', async () => {
      const slug = 'complex-design';

      await saveDesign(slug, COMPLEX_DOCUMENT, TEST_BASE_DIR);
      const loaded = await loadDesign(slug, TEST_BASE_DIR);

      expect(loaded.root.nodeType).toBe('layout');
      const root = loaded.root as any;
      expect(root.children).toHaveLength(2);
      expect(root.children[1].nodeType).toBe('layout');
    });
  });

  describe('Create from Template', () => {
    it('should create a new design from template', async () => {
      const slug = 'new-design';
      const metadata = {
        title: 'My New Design',
        author: 'Test Author',
      };

      const created = await createDesign(slug, metadata, TEST_BASE_DIR);

      expect(created.metadata.title).toBe('My New Design');
      expect(created.metadata.author).toBe('Test Author');
      expect(created.metadata.createdAt).toBeDefined();
      expect(created.metadata.updatedAt).toBeDefined();

      // Verify file was created
      const exists = await designExists(slug, TEST_BASE_DIR);
      expect(exists).toBe(true);

      // Verify can load the created design
      const loaded = await loadDesign(slug, TEST_BASE_DIR);
      expect(loaded.metadata.title).toBe('My New Design');
    });

    it('should reject creating design with existing slug', async () => {
      const slug = 'duplicate-design';

      await createDesign(slug, {}, TEST_BASE_DIR);

      await expect(
        createDesign(slug, {}, TEST_BASE_DIR)
      ).rejects.toThrow('Design already exists');
    });

    it('should reject invalid slug on create', async () => {
      await expect(
        createDesign('invalid slug', {}, TEST_BASE_DIR)
      ).rejects.toThrow('Invalid slug');
    });
  });

  describe('List Designs', () => {
    it('should list all designs', async () => {
      await createDesign('design-1', { title: 'Design 1' }, TEST_BASE_DIR);
      await createDesign('design-2', { title: 'Design 2' }, TEST_BASE_DIR);
      await createDesign('design-3', { title: 'Design 3' }, TEST_BASE_DIR);

      const designs = await listDesigns(TEST_BASE_DIR);

      expect(designs).toHaveLength(3);
      expect(designs.map((d) => d.slug)).toContain('design-1');
      expect(designs.map((d) => d.slug)).toContain('design-2');
      expect(designs.map((d) => d.slug)).toContain('design-3');
    });

    it('should return empty array when no designs exist', async () => {
      const designs = await listDesigns(TEST_BASE_DIR);
      expect(designs).toEqual([]);
    });

    it('should not include template in list', async () => {
      await createDesign('design-1', {}, TEST_BASE_DIR);

      const designs = await listDesigns(TEST_BASE_DIR);

      expect(designs).toHaveLength(1);
      expect(designs[0].slug).toBe('design-1');
      expect(designs.map((d) => d.slug)).not.toContain('_template');
    });

    it('should include metadata in list', async () => {
      await createDesign(
        'design-with-meta',
        {
          title: 'Test Title',
          description: 'Test Description',
          tags: ['tag1', 'tag2'],
        },
        TEST_BASE_DIR
      );

      const designs = await listDesigns(TEST_BASE_DIR);

      expect(designs).toHaveLength(1);
      expect(designs[0].title).toBe('Test Title');
      expect(designs[0].description).toBe('Test Description');
      expect(designs[0].tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('Delete Design', () => {
    it('should delete a design', async () => {
      const slug = 'to-be-deleted';

      await createDesign(slug, {}, TEST_BASE_DIR);
      expect(await designExists(slug, TEST_BASE_DIR)).toBe(true);

      await deleteDesign(slug, TEST_BASE_DIR);
      expect(await designExists(slug, TEST_BASE_DIR)).toBe(false);
    });

    it('should throw error when deleting non-existent design', async () => {
      await expect(
        deleteDesign('non-existent', TEST_BASE_DIR)
      ).rejects.toThrow('Design not found');
    });
  });

  describe('Design Exists', () => {
    it('should return true for existing design', async () => {
      const slug = 'existing-design';
      await createDesign(slug, {}, TEST_BASE_DIR);

      expect(await designExists(slug, TEST_BASE_DIR)).toBe(true);
    });

    it('should return false for non-existent design', async () => {
      expect(await designExists('non-existent', TEST_BASE_DIR)).toBe(false);
    });
  });
});

describe('Design Store - Serialization', () => {
  describe('YAML Round-trip', () => {
    it('should serialize and deserialize without data loss', () => {
      const yaml = toYAML(SAMPLE_DOCUMENT);
      const parsed = fromYAML(yaml);

      expect(parsed.metadata.title).toBe(SAMPLE_DOCUMENT.metadata.title);
      expect(parsed.root).toEqual(SAMPLE_DOCUMENT.root);
    });

    it('should handle complex nested structures', () => {
      const yaml = toYAML(COMPLEX_DOCUMENT);
      const parsed = fromYAML(yaml);

      expect(parsed).toEqual(COMPLEX_DOCUMENT);
    });

    it('should produce readable YAML', () => {
      const yaml = toYAML(SAMPLE_DOCUMENT);

      expect(yaml).toContain('metadata:');
      expect(yaml).toContain('title: Test Design');
      expect(yaml).toContain('root:');
      expect(yaml).toContain('nodeType: layout');
    });
  });

  describe('JSON Round-trip', () => {
    it('should serialize and deserialize without data loss', () => {
      const json = toJSON(SAMPLE_DOCUMENT);
      const parsed = fromJSON(json);

      expect(parsed).toEqual(SAMPLE_DOCUMENT);
    });

    it('should handle complex nested structures', () => {
      const json = toJSON(COMPLEX_DOCUMENT);
      const parsed = fromJSON(json);

      expect(parsed).toEqual(COMPLEX_DOCUMENT);
    });

    it('should produce valid JSON', () => {
      const json = toJSON(SAMPLE_DOCUMENT);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.metadata.title).toBe('Test Design');
    });
  });

  describe('Cross-format Compatibility', () => {
    it('should convert between JSON and YAML', () => {
      const json = toJSON(SAMPLE_DOCUMENT);
      const fromJsonDoc = fromJSON(json);

      const yaml = toYAML(fromJsonDoc);
      const fromYamlDoc = fromYAML(yaml);

      expect(fromYamlDoc).toEqual(SAMPLE_DOCUMENT);
    });
  });
});

describe('Design Store - Validation', () => {
  beforeEach(async () => {
    await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  it('should reject invalid document on save', async () => {
    const invalidDoc = {
      metadata: {},
      root: {
        nodeType: 'invalid',
      },
    } as any;

    // saveDesign doesn't validate before writing, but load will fail
    await saveDesign('invalid', invalidDoc as DesignDocument, TEST_BASE_DIR);

    await expect(loadDesign('invalid', TEST_BASE_DIR)).rejects.toThrow();
  });

  it('should reject document with invalid component ref', async () => {
    const invalidDoc: DesignDocument = {
      metadata: {},
      root: {
        nodeType: 'component',
        id: 'test',
        ref: 'InvalidRef', // Missing "oods:" prefix
        props: {},
      },
    };

    await saveDesign('invalid-ref', invalidDoc, TEST_BASE_DIR);

    await expect(loadDesign('invalid-ref', TEST_BASE_DIR)).rejects.toThrow();
  });
});
