// // TEST-ONLY: allow tests to access the cache

import type { LRUMap } from '@sentry/core';
import type { FrameVariables } from './common';

/**
 * Provides test helper methods for interacting with the local variables cache.
 * These methods are intended for use in unit tests to inspect and manipulate
 * the internal cache of frame variables used by the LocalVariables integration.
 *
 * @param cachedFrames - The LRUMap instance storing cached frame variables.
 * @returns An object containing helper methods for cache inspection and mutation.
 */
export function localVariablesTestHelperMethods(cachedFrames: LRUMap<string, FrameVariables[]>): {
  _getCachedFramesCount: () => number;
  _getFirstCachedFrame: () => FrameVariables[] | undefined;
  _setCachedFrame: (hash: string, frames: FrameVariables[]) => void;
} {
  /**
   * Returns the number of entries in the local variables cache.
   */
  function _getCachedFramesCount(): number {
    return cachedFrames.size;
  }

  /**
   * Returns the first set of cached frame variables, or undefined if the cache is empty.
   */
  function _getFirstCachedFrame(): FrameVariables[] | undefined {
    return cachedFrames.values()[0];
  }

  /**
   * Sets the cached frame variables for a given stack hash.
   *
   * @param hash - The stack hash to associate with the cached frames.
   * @param frames - The frame variables to cache.
   */
  function _setCachedFrame(hash: string, frames: FrameVariables[]): void {
    cachedFrames.set(hash, frames);
  }

  return {
    _getCachedFramesCount,
    _getFirstCachedFrame,
    _setCachedFrame,
  };
}
