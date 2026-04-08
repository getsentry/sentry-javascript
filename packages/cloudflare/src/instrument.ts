// Use a global WeakMap to track instrumented objects across module instances.
// This is important for Cloudflare Workers where the module may be bundled
// separately for workers and Durable Objects, but they share the same global scope.
// The WeakMap stores original -> instrumented mappings so we can retrieve the
// instrumented version even if we only have a reference to the original.
const GLOBAL_KEY = '__SENTRY_INSTRUMENTED_MAP__' as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getInstrumentedMap(): WeakMap<any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalObj = globalThis as typeof globalThis & { [GLOBAL_KEY]?: WeakMap<any, any> };
  if (!globalObj[GLOBAL_KEY]) {
    globalObj[GLOBAL_KEY] = new WeakMap();
  }
  return globalObj[GLOBAL_KEY];
}

/**
 * Check if a value can be used as a WeakMap key.
 * WeakMap keys must be objects or non-registered symbols.
 */
function isWeakMapKey(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/**
 * Mark an object as instrumented, storing the instrumented version.
 * @param original The original uninstrumented object
 * @param instrumented The instrumented version (defaults to original if not provided)
 */
export function markAsInstrumented<T>(original: T, instrumented?: T): void {
  try {
    if (isWeakMapKey(original)) {
      // Store mapping from original to instrumented version
      // If instrumented is not provided, store original (for backwards compat)
      getInstrumentedMap().set(original, instrumented ?? original);
    }
    // Also mark the instrumented version itself so we recognize it
    if (isWeakMapKey(instrumented) && instrumented !== original) {
      getInstrumentedMap().set(instrumented, instrumented);
    }
  } catch {
    // ignore errors here
  }
}

/**
 * Get the instrumented version of an object, if available.
 * Returns the instrumented version if the object was previously instrumented,
 * or undefined if not found.
 */
export function getInstrumented<T>(obj: T): T | undefined {
  try {
    if (isWeakMapKey(obj)) {
      return getInstrumentedMap().get(obj) as T | undefined;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the already-instrumented version of `original` if one exists,
 * otherwise calls `instrumentFn` to create it, marks the mapping, and returns it.
 *
 * @param noMark - If true, skips storing the original→instrumented mapping.
 */
export function ensureInstrumented<T>(original: T, instrumentFn: (original: T) => T, noMark?: boolean): T {
  const existing = getInstrumented(original);

  if (existing) {
    return existing;
  }

  const instrumented = instrumentFn(original);

  if (!noMark) {
    markAsInstrumented(original, instrumented);
  }

  return instrumented;
}
