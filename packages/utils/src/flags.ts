import type { FeatureFlag } from '@sentry/types';

/**
 * Ordered LRU cache for storing feature flags in the scope context. The name
 * of each flag in the buffer is unique, and the output of getAll() is ordered
 * from oldest to newest.
 */

export const FLAG_BUFFER_SIZE = 100;

/**
 * Insert into a FeatureFlag array while maintaining ordered LRU properties.
 * After inserting:
 * - The flag is guaranteed to be at the end of `flags`.
 * - No other flags with the same name exist in `flags`.
 * - The length of `flags` does not exceed FLAG_BUFFER_SIZE. If needed, the
 *   oldest inserted flag is evicted.
 */
export function insertToFlagBuffer(flags: FeatureFlag[], name: string, value: boolean): void {
  // Check if the flag is already in the buffer
  const index = flags.findIndex(f => f.flag === name);

  if (index !== -1) {
    // The flag was found, remove it from its current position - O(n)
    flags.splice(index, 1);
  }

  if (flags.length === FLAG_BUFFER_SIZE) {
    // If at capacity, pop the earliest flag - O(n)
    flags.shift();
  }

  // Push the flag to the end - O(1)
  flags.push({
    flag: name,
    result: value,
  });
}
