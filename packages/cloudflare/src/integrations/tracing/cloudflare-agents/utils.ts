/**
 * Utility functions for Cloudflare Agents integration
 */

import { INTERNAL_METHODS, LIFECYCLE_ENTRY_POINTS, type LifecycleEntryPoint } from './constants';

/**
 * Checks if a method is a known lifecycle entry point
 */
export function isLifecycleEntryPoint(propertyName: string): propertyName is LifecycleEntryPoint {
  return LIFECYCLE_ENTRY_POINTS.includes(propertyName as LifecycleEntryPoint);
}

/**
 * Checks if a method should be instrumented as an entry point.
 * 
 * @param propertyName - The method name to check
 * @param isUserDefined - Whether the method is defined on the user's class (not inherited from Agent base)
 * 
 * Returns true for:
 * - Known lifecycle entry points (onRequest, onMessage, onConnect)
 * - User-defined methods that are likely @callable() (public, not in INTERNAL_METHODS)
 * 
 * Returns false for:
 * - Constructor
 * - Private methods (starting with _)
 * - Internal Agent methods (setState, broadcast, etc.)
 */
export function shouldInstrumentMethod(propertyName: string, isUserDefined: boolean): boolean {
  // Skip constructor and private methods
  if (propertyName === 'constructor' || propertyName.startsWith('_')) {
    return false;
  }

  // Skip Agent internal methods
  if (INTERNAL_METHODS.includes(propertyName as (typeof INTERNAL_METHODS)[number])) {
    return false;
  }

  // Always instrument known lifecycle entry points
  if (isLifecycleEntryPoint(propertyName)) {
    return true;
  }

  // For user-defined methods: only instrument if they're public and not internal
  // These are likely @callable() methods
  // For base class methods: skip (already checked lifecycle entry points above)
  return isUserDefined;
}
