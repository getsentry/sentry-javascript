import type { Event, FeatureFlag } from '@sentry/core';

import { getCurrentScope, logger } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Ordered LRU cache for storing feature flags in the scope context. The name
 * of each flag in the buffer is unique, and the output of getAll() is ordered
 * from oldest to newest.
 */

/**
 * Max size of the LRU flag buffer stored in Sentry scope and event contexts.
 */
export const FLAG_BUFFER_SIZE = 100;

/**
 * Copies feature flags that are in current scope context to the event context
 */
export function copyFlagsFromScopeToEvent(event: Event): Event {
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
 * Creates a feature flags values array in current context if it does not exist
 * and inserts the flag into a FeatureFlag array while maintaining ordered LRU
 * properties. Not thread-safe. After inserting:
 * - `flags` is sorted in order of recency, with the newest flag at the end.
 * - No other flags with the same name exist in `flags`.
 * - The length of `flags` does not exceed `maxSize`. The oldest flag is evicted
 *  as needed.
 *
 * @param name     Name of the feature flag to insert.
 * @param value    Value of the feature flag.
 * @param maxSize  Max number of flags the buffer should store. It's recommended
 *   to keep this consistent across insertions. Default is FLAG_BUFFER_SIZE
 */
export function insertFlagToScope(name: string, value: unknown, maxSize: number = FLAG_BUFFER_SIZE): void {
  const scopeContexts = getCurrentScope().getScopeData().contexts;
  if (!scopeContexts.flags) {
    scopeContexts.flags = { values: [] };
  }
  const flags = scopeContexts.flags.values as FeatureFlag[];
  insertToFlagBuffer(flags, name, value, maxSize);
}

/**
 * Exported for tests. Currently only accepts boolean values (otherwise no-op).
 */
export function insertToFlagBuffer(flags: FeatureFlag[], name: string, value: unknown, maxSize: number): void {
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
    // If at capacity, pop the earliest flag - O(n)
    flags.shift();
  }

  // Push the flag to the end - O(1)
  flags.push({
    flag: name,
    result: value,
  });
}
