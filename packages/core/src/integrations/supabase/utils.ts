import { FILTER_MAPPINGS } from './constants';
import type { SentryInstrumented } from './types';

/** Marks a function/object as already instrumented to prevent double-wrapping. */
export function _markAsInstrumented<T>(fn: T): void {
  try {
    (fn as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__ = true;
  } catch {
    // Ignore - property may be non-configurable or frozen
  }
}

/** Checks whether a function/object has already been instrumented. */
export function _isInstrumented<T>(fn: T): boolean | undefined {
  try {
    return (fn as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__;
  } catch {
    // Ignore - property access may fail on exotic objects
    return false;
  }
}

/**
 * Extracts the database operation type from the HTTP method and headers
 * @param method - The HTTP method of the request
 * @param headers - The request headers
 * @returns The database operation type ('select', 'insert', 'upsert', 'update', or 'delete')
 */
export function extractOperation(method: string, headers: Record<string, string> = {}): string {
  switch (method) {
    case 'GET': {
      return 'select';
    }
    case 'POST': {
      if (headers['Prefer']?.includes('resolution=')) {
        return 'upsert';
      } else {
        return 'insert';
      }
    }
    case 'PATCH': {
      return 'update';
    }
    case 'DELETE': {
      return 'delete';
    }
    default: {
      return '<unknown-op>';
    }
  }
}

/**
 * Translates Supabase filter parameters into readable method names for tracing
 * @param key - The filter key from the URL search parameters
 * @param query - The filter value from the URL search parameters
 * @returns A string representation of the filter as a method call
 */
export function translateFiltersIntoMethods(key: string, query: string): string {
  if (query === '' || query === '*') {
    return 'select(*)';
  }

  if (key === 'select') {
    return `select(${query})`;
  }

  if (key === 'or' || key.endsWith('.or')) {
    return `${key}${query}`;
  }

  const [filter, ...value] = query.split('.');

  let method;
  // Handle optional `configPart` of the filter
  if (filter?.startsWith('fts')) {
    method = 'textSearch';
  } else if (filter?.startsWith('plfts')) {
    method = 'textSearch[plain]';
  } else if (filter?.startsWith('phfts')) {
    method = 'textSearch[phrase]';
  } else if (filter?.startsWith('wfts')) {
    method = 'textSearch[websearch]';
  } else {
    method = (filter && FILTER_MAPPINGS[filter as keyof typeof FILTER_MAPPINGS]) || 'filter';
  }

  return `${method}(${key}, ${value.join('.')})`;
}

/**
 * Normalizes RPC function names by stripping schema prefixes.
 * Handles schema-qualified names like 'pgmq.send' → 'send'
 *
 * @param name - The RPC function name, potentially schema-qualified
 * @returns The normalized function name without schema prefix
 */
export function _normalizeRpcFunctionName(name: unknown): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Strip schema prefix: 'pgmq.send' → 'send', 'my_schema.pop' → 'pop'
  if (name.includes('.')) {
    const parts = name.split('.');
    return parts[parts.length - 1] || '';
  }

  return name;
}
