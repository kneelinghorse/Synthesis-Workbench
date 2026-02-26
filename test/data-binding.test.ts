import { describe, it, expect } from 'vitest';
import {
  isDataBinding,
  extractBindingPath,
  resolvePath,
  resolveBindings,
  createDataContext,
  type DataContext,
} from '@/lib/engine/data-binding';

// ============================================================================
// isDataBinding
// ============================================================================

describe('isDataBinding', () => {
  it('detects valid $data.x binding', () => {
    expect(isDataBinding('$data.color')).toBe(true);
  });

  it('detects nested $data.a.b.c binding', () => {
    expect(isDataBinding('$data.colors.primary')).toBe(true);
    expect(isDataBinding('$data.a.b.c.d.e')).toBe(true);
  });

  it('rejects plain strings', () => {
    expect(isDataBinding('hello')).toBe(false);
    expect(isDataBinding('colors.primary')).toBe(false);
  });

  it('rejects "$data." with no path', () => {
    expect(isDataBinding('$data.')).toBe(false);
  });

  it('rejects "$data" without dot', () => {
    expect(isDataBinding('$data')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isDataBinding(42)).toBe(false);
    expect(isDataBinding(null)).toBe(false);
    expect(isDataBinding(undefined)).toBe(false);
    expect(isDataBinding(true)).toBe(false);
    expect(isDataBinding({})).toBe(false);
    expect(isDataBinding([])).toBe(false);
  });

  it('rejects strings starting with similar but incorrect prefix', () => {
    expect(isDataBinding('$Data.x')).toBe(false);
    expect(isDataBinding('$DATA.x')).toBe(false);
    expect(isDataBinding('$$data.x')).toBe(false);
    expect(isDataBinding('data.x')).toBe(false);
  });
});

// ============================================================================
// extractBindingPath
// ============================================================================

describe('extractBindingPath', () => {
  it('extracts path from binding', () => {
    expect(extractBindingPath('$data.colors.primary')).toBe('colors.primary');
  });

  it('extracts single-segment path', () => {
    expect(extractBindingPath('$data.name')).toBe('name');
  });

  it('returns null for non-bindings', () => {
    expect(extractBindingPath('hello')).toBeNull();
    expect(extractBindingPath(42)).toBeNull();
    expect(extractBindingPath('$data.')).toBeNull();
  });
});

// ============================================================================
// resolvePath
// ============================================================================

describe('resolvePath', () => {
  const context = {
    colors: { primary: '#3b82f6', secondary: '#10b981' },
    user: { name: 'Alice', profile: { age: 30 } },
    simple: 'value',
  };

  it('resolves single-segment path', () => {
    expect(resolvePath(context, 'simple')).toBe('value');
  });

  it('resolves two-segment path', () => {
    expect(resolvePath(context, 'colors.primary')).toBe('#3b82f6');
  });

  it('resolves deeply nested path', () => {
    expect(resolvePath(context, 'user.profile.age')).toBe(30);
  });

  it('returns undefined for missing path', () => {
    expect(resolvePath(context, 'missing')).toBeUndefined();
    expect(resolvePath(context, 'colors.missing')).toBeUndefined();
    expect(resolvePath(context, 'a.b.c.d')).toBeUndefined();
  });

  it('returns undefined for path through non-object', () => {
    expect(resolvePath(context, 'simple.nested')).toBeUndefined();
  });

  it('resolves to object values', () => {
    expect(resolvePath(context, 'colors')).toEqual({
      primary: '#3b82f6',
      secondary: '#10b981',
    });
  });
});

// ============================================================================
// resolveBindings
// ============================================================================

describe('resolveBindings', () => {
  const context: DataContext = {
    colors: { primary: '#3b82f6', text: '#111' },
    content: { title: 'Hello World', count: 42 },
    items: ['a', 'b', 'c'],
  };

  it('resolves simple bindings in props', () => {
    const props = {
      color: '$data.colors.primary',
      label: '$data.content.title',
    };

    const resolved = resolveBindings(props, context);
    expect(resolved.color).toBe('#3b82f6');
    expect(resolved.label).toBe('Hello World');
  });

  it('passes through static (non-binding) values', () => {
    const props = {
      variant: 'primary',
      size: 42,
      disabled: false,
      data: null,
    };

    const resolved = resolveBindings(props, context);
    expect(resolved).toEqual(props);
  });

  it('handles mixed bound and static props', () => {
    const props = {
      label: '$data.content.title',
      variant: 'primary',
      color: '$data.colors.primary',
      size: 'lg',
    };

    const resolved = resolveBindings(props, context);
    expect(resolved.label).toBe('Hello World');
    expect(resolved.variant).toBe('primary');
    expect(resolved.color).toBe('#3b82f6');
    expect(resolved.size).toBe('lg');
  });

  it('returns undefined for unresolved bindings by default', () => {
    const props = { missing: '$data.does.not.exist' };

    const resolved = resolveBindings(props, context);
    expect(resolved.missing).toBeUndefined();
  });

  it('uses configurable fallback for unresolved bindings', () => {
    const props = {
      missing: '$data.does.not.exist',
      existing: '$data.colors.primary',
    };

    const resolved = resolveBindings(props, context, { fallback: 'N/A' });
    expect(resolved.missing).toBe('N/A');
    expect(resolved.existing).toBe('#3b82f6');
  });

  it('emits missing-path diagnostics for unresolved bindings', () => {
    const issues: Array<{ code: string; path: string; message: string }> = [];
    const props = { missing: '$data.does.not.exist' };

    const resolved = resolveBindings(props, context, {
      onIssue: (issue) => issues.push(issue),
    });

    expect(resolved.missing).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('missing_path');
    expect(issues[0].path).toBe('does.not.exist');
    expect(issues[0].message).toContain('Missing data path "$data.does.not.exist"');
  });

  it('emits type-mismatch diagnostics when traversing through a primitive', () => {
    const issues: Array<{ code: string; path: string; message: string }> = [];
    const props = { badPath: '$data.content.title.length.value' };

    const resolved = resolveBindings(props, context, {
      onIssue: (issue) => issues.push(issue),
    });

    expect(resolved.badPath).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('type_mismatch');
    expect(issues[0].path).toBe('content.title.length.value');
    expect(issues[0].message).toContain(
      'Type mismatch while resolving "$data.content.title.length.value"'
    );
  });

  it('resolves bindings in nested prop objects', () => {
    const props = {
      style: {
        color: '$data.colors.text',
        backgroundColor: '$data.colors.primary',
        fontSize: '16px',
      },
    };

    const resolved = resolveBindings(props, context);
    expect(resolved.style).toEqual({
      color: '#111',
      backgroundColor: '#3b82f6',
      fontSize: '16px',
    });
  });

  it('resolves bindings in arrays within props', () => {
    const props = {
      labels: ['$data.content.title', 'static', '$data.colors.primary'],
    };

    const resolved = resolveBindings(props, context);
    expect(resolved.labels).toEqual(['Hello World', 'static', '#3b82f6']);
  });

  it('resolves deeply nested props with mixed bindings', () => {
    const props = {
      config: {
        theme: {
          colors: {
            primary: '$data.colors.primary',
            text: '$data.colors.text',
          },
          static: true,
        },
        title: '$data.content.title',
      },
    };

    const resolved = resolveBindings(props, context);
    expect(resolved.config).toEqual({
      theme: {
        colors: {
          primary: '#3b82f6',
          text: '#111',
        },
        static: true,
      },
      title: 'Hello World',
    });
  });

  it('resolves binding to non-primitive values', () => {
    const props = { allColors: '$data.colors' };

    const resolved = resolveBindings(props, context);
    expect(resolved.allColors).toEqual({ primary: '#3b82f6', text: '#111' });
  });

  it('resolves binding to numeric value', () => {
    const props = { count: '$data.content.count' };

    const resolved = resolveBindings(props, context);
    expect(resolved.count).toBe(42);
  });

  it('resolves binding to array value', () => {
    const props = { list: '$data.items' };

    const resolved = resolveBindings(props, context);
    expect(resolved.list).toEqual(['a', 'b', 'c']);
  });

  it('handles empty props', () => {
    const resolved = resolveBindings({}, context);
    expect(resolved).toEqual({});
  });

  it('handles empty context gracefully', () => {
    const props = {
      color: '$data.colors.primary',
      label: 'static',
    };

    const resolved = resolveBindings(props, {});
    expect(resolved.color).toBeUndefined();
    expect(resolved.label).toBe('static');
  });
});

// ============================================================================
// createDataContext
// ============================================================================

describe('createDataContext', () => {
  it('creates a DataContext from a plain object', () => {
    const ctx = createDataContext({ colors: { primary: '#fff' } });
    expect(ctx.colors).toEqual({ primary: '#fff' });
  });

  it('creates an empty DataContext', () => {
    const ctx = createDataContext({});
    expect(ctx).toEqual({});
  });
});
