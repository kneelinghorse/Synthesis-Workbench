/**
 * Data Binding Parser & Resolver
 *
 * Runtime implementation for $data.x binding syntax.
 * Detects binding expressions in component props and resolves them
 * against a DataContext, supporting nested dot-path access.
 */

import type { ComponentProps } from '@/types/document-model';

// ============================================================================
// Types
// ============================================================================

/**
 * DataContext: The resolution context for data bindings.
 * A nested key-value structure that binding paths are resolved against.
 *
 * Example:
 *   { colors: { primary: '#3b82f6' }, user: { name: 'Alice' } }
 *
 * Resolves:
 *   $data.colors.primary → '#3b82f6'
 *   $data.user.name → 'Alice'
 */
export type DataContext = Record<string, unknown>;

export type BindingResolutionIssueCode = 'missing_path' | 'type_mismatch';

export interface BindingResolutionIssue {
  code: BindingResolutionIssueCode;
  binding: string;
  path: string;
  message: string;
}

/**
 * Special fallback sentinel: when set, unresolved bindings return the
 * original binding expression string (e.g. "$data.colors.primary").
 */
export const SHOW_BINDING_EXPRESSION = Symbol.for('show-binding-expression');

/** Options for binding resolution */
export interface ResolveBindingsOptions {
  /**
   * Value returned for unresolved binding paths. Defaults to undefined.
   * Pass SHOW_BINDING_EXPRESSION to preserve the original "$data.x" string.
   */
  fallback?: unknown;
  /** Optional callback for detailed binding resolution issues. */
  onIssue?: (issue: BindingResolutionIssue) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DATA_BINDING_PREFIX = '$data.';

const formatValueType = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if a value is a $data.x binding expression.
 *
 * A valid binding is a string starting with "$data." followed by
 * at least one character of path (e.g. "$data.x", "$data.a.b.c").
 */
export function isDataBinding(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(DATA_BINDING_PREFIX) &&
    value.length > DATA_BINDING_PREFIX.length
  );
}

/**
 * Extract the dot-path from a binding expression.
 * "$data.colors.primary" → "colors.primary"
 *
 * Returns null if the value is not a valid binding.
 */
export function extractBindingPath(value: unknown): string | null {
  if (!isDataBinding(value)) return null;
  return value.slice(DATA_BINDING_PREFIX.length);
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Resolve a dot-path against an object.
 * "colors.primary" resolved against { colors: { primary: '#fff' } } → '#fff'
 *
 * Returns undefined for missing or unreachable paths.
 */
export function resolvePath(
  obj: Record<string, unknown>,
  path: string
): unknown {
  return resolvePathWithDiagnostics(obj, path).value;
}

function resolvePathWithDiagnostics(
  obj: Record<string, unknown>,
  path: string
): { value: unknown; issue?: BindingResolutionIssue } {
  const segments = path.split('.');
  let current: unknown = obj;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (current === null || current === undefined) {
      return {
        value: undefined,
        issue: {
          code: 'missing_path',
          binding: `${DATA_BINDING_PREFIX}${path}`,
          path,
          message: `Missing data path "${DATA_BINDING_PREFIX}${path}" (segment "${segment}" not found).`,
        },
      };
    }

    if (typeof current !== 'object') {
      const parentPath = segments.slice(0, index).join('.');
      return {
        value: undefined,
        issue: {
          code: 'type_mismatch',
          binding: `${DATA_BINDING_PREFIX}${path}`,
          path,
          message: `Type mismatch while resolving "${DATA_BINDING_PREFIX}${path}": "${DATA_BINDING_PREFIX}${parentPath}" is ${formatValueType(current)}, expected object.`,
        },
      };
    }

    const record = current as Record<string, unknown>;
    if (!(segment in record)) {
      return {
        value: undefined,
        issue: {
          code: 'missing_path',
          binding: `${DATA_BINDING_PREFIX}${path}`,
          path,
          message: `Missing data path "${DATA_BINDING_PREFIX}${path}" (segment "${segment}" not found).`,
        },
      };
    }

    const next = record[segment];
    if (
      index < segments.length - 1 &&
      (next === null || typeof next !== 'object')
    ) {
      const resolvedPath = segments.slice(0, index + 1).join('.');
      const nextSegment = segments[index + 1];
      return {
        value: undefined,
        issue: {
          code: 'type_mismatch',
          binding: `${DATA_BINDING_PREFIX}${path}`,
          path,
          message: `Type mismatch while resolving "${DATA_BINDING_PREFIX}${path}": "${DATA_BINDING_PREFIX}${resolvedPath}" is ${formatValueType(next)}, expected object before "${nextSegment}".`,
        },
      };
    }

    current = next;
  }

  return { value: current };
}

/**
 * Resolve a single value: if it's a binding, resolve it; otherwise pass through.
 */
function resolveValue(
  value: unknown,
  context: DataContext,
  options: ResolveBindingsOptions
): unknown {
  if (!isDataBinding(value)) return value;
  const path = value.slice(DATA_BINDING_PREFIX.length);
  const resolved = resolvePathWithDiagnostics(context, path);

  if (resolved.issue) {
    options.onIssue?.(resolved.issue);
    return options.fallback === SHOW_BINDING_EXPRESSION ? value : options.fallback;
  }

  return resolved.value;
}

/**
 * Recursively resolve bindings in a value.
 * Handles nested objects and arrays.
 */
function resolveDeep(
  value: unknown,
  context: DataContext,
  options: ResolveBindingsOptions
): unknown {
  if (isDataBinding(value)) {
    return resolveValue(value, context, options);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, context, options));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveDeep(val, context, options);
    }
    return result;
  }

  return value;
}

/**
 * Resolve all $data.x bindings in a ComponentProps object.
 *
 * Walks the props object (including nested objects and arrays) and replaces
 * any binding expression with its resolved value from the DataContext.
 *
 * Static (non-binding) values pass through unchanged.
 * Unresolved bindings return the configured fallback (default: undefined).
 */
export function resolveBindings(
  props: ComponentProps,
  context: DataContext,
  options: ResolveBindingsOptions = {}
): ComponentProps {
  const result: ComponentProps = {};

  for (const [key, value] of Object.entries(props)) {
    result[key] = resolveDeep(value, context, options);
  }

  return result;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a DataContext from a plain object.
 * Convenience factory that provides type clarity at call sites.
 */
export function createDataContext(data: Record<string, unknown>): DataContext {
  return data;
}
