import type { Scope } from '@sentry/types';

interface GlobalData {
  globalScope?: Scope;
}

const GLOBAL_DATA: GlobalData = {};

/**
 * Get the global data.
 */
export function getGlobalData(): GlobalData {
  return GLOBAL_DATA;
}

/**
 * Reset all global data.
 * Mostly useful for tests.
 */
export function clearGlobalData(): void {
  delete GLOBAL_DATA.globalScope;
}
