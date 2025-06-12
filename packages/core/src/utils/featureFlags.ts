import { getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { type FeatureFlag } from '../featureFlags';
import { type Event } from '../types-hoist/event';
import { type Span } from '../types-hoist/span';
import { logger } from '../utils-hoist/logger';
import { GLOBAL_OBJ } from '../utils-hoist/worldwide';
import { getActiveSpan } from './spanUtils';

/**
 * Ordered LRU cache for storing feature flags in the scope context. The name
 * of each flag in the buffer is unique, and the output of getAll() is ordered
 * from oldest to newest.
 */

/**
 * Max size of the LRU flag buffer stored in Sentry scope and event contexts.
 */
const FLAG_BUFFER_SIZE = 100;

/**
 * Max number of flag evaluations to record per span.
 */
const MAX_FLAGS_PER_SPAN = 10;

// Global map of spans to feature flag buffers. Populated by feature flag integrations.
GLOBAL_OBJ._spanToFlagBufferMap = new WeakMap<Span, Set<string>>();

const SPAN_FLAG_ATTRIBUTE_PREFIX = 'flag.evaluation.';

/**
 * Copies feature flags that are in current scope context to the event context
 */
export function _INTERNAL_copyFlagsFromScopeToEvent(event: Event): Event {
  const scope = getCurrentScope();
  const flagContext = scope.getScopeData().contexts.flags;
  const flagBuffer = flagContext ? flagContext.values : [];

  if (!flagBuffer.length) {
    return event;
  }

  if (event.contexts === undefined) {
    event.contexts = {};
  }
  event.contexts.flags = { values: [...flagBuffer] };
  return event;
}

/**
 * Inserts a flag into the current scope's context while maintaining ordered LRU properties.
 * Not thread-safe. After inserting:
 * - The flag buffer is sorted in order of recency, with the newest evaluation at the end.
 * - The names in the buffer are always unique.
 * - The length of the buffer never exceeds `maxSize`.
 *
 * @param name     Name of the feature flag to insert.
 * @param value    Value of the feature flag.
 * @param maxSize  Max number of flags the buffer should store. Default value should always be used in production.
 */
export function _INTERNAL_insertFlagToScope(name: string, value: unknown, maxSize: number = FLAG_BUFFER_SIZE): void {
  const scopeContexts = getCurrentScope().getScopeData().contexts;
  if (!scopeContexts.flags) {
    scopeContexts.flags = { values: [] };
  }
  const flags = scopeContexts.flags.values as FeatureFlag[];
  _INTERNAL_insertToFlagBuffer(flags, name, value, maxSize);
}

/**
 * Exported for tests only. Currently only accepts boolean values (otherwise no-op).
 * Inserts a flag into a FeatureFlag array while maintaining the following properties:
 * - Flags are sorted in order of recency, with the newest evaluation at the end.
 * - The flag names are always unique.
 * - The length of the array never exceeds `maxSize`.
 *
 * @param flags      The buffer to insert the flag into.
 * @param name       Name of the feature flag to insert.
 * @param value      Value of the feature flag.
 * @param maxSize    Max number of flags the buffer should store. Default value should always be used in production.
 * @param allowEviction  If true, the oldest flag is evicted when the buffer is full. Otherwise the new flag is dropped.
 */
export function _INTERNAL_insertToFlagBuffer(
  flags: FeatureFlag[],
  name: string,
  value: unknown,
  maxSize: number,
  allowEviction: boolean = true,
): void {
  if (typeof value !== 'boolean') {
    return;
  }

  if (flags.length > maxSize) {
    DEBUG_BUILD && logger.error(`[Feature Flags] insertToFlagBuffer called on a buffer larger than maxSize=${maxSize}`);
    return;
  }

  // Check if the flag is already in the buffer - O(n)
  const index = flags.findIndex(f => f.flag === name);

  if (index !== -1) {
    // The flag was found, remove it from its current position - O(n)
    flags.splice(index, 1);
  }

  if (flags.length === maxSize) {
    if (allowEviction) {
      // If at capacity, pop the earliest flag - O(n)
      flags.shift();
    } else {
      return;
    }
  }

  // Push the flag to the end - O(1)
  flags.push({
    flag: name,
    result: value,
  });
}

/**
 * Records a feature flag evaluation for the active span. This is a no-op for non-boolean values.
 * The flag and its value is stored in span attributes with the `flag.evaluation` prefix. Once the
 * unique flags for a span reaches maxFlagsPerSpan, subsequent flags are dropped.
 *
 * @param name             Name of the feature flag.
 * @param value            Value of the feature flag. Non-boolean values are ignored.
 * @param maxFlagsPerSpan  Max number of flags a buffer should store. Default value should always be used in production.
 */
export function _INTERNAL_bufferSpanFeatureFlag(
  name: string,
  value: unknown,
  maxFlagsPerSpan: number = MAX_FLAGS_PER_SPAN,
): void {
  const spanFlagMap = GLOBAL_OBJ._spanToFlagBufferMap;
  if (!spanFlagMap || typeof value !== 'boolean') {
    return;
  }

  const span = getActiveSpan();
  if (span) {
    const flags = spanFlagMap.get(span) || new Set<string>();
    if (flags.has(name)) {
      span.setAttribute(`${SPAN_FLAG_ATTRIBUTE_PREFIX}${name}`, value);
    } else if (flags.size < maxFlagsPerSpan) {
      flags.add(name);
      span.setAttribute(`${SPAN_FLAG_ATTRIBUTE_PREFIX}${name}`, value);
    }
    spanFlagMap.set(span, flags);
  }
}
