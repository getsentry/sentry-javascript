import { GLOBAL_OBJ } from '@sentry/utils';

import type { FutureConfig, ServerBuild } from './vendor/types';

export type EnhancedGlobal = typeof GLOBAL_OBJ & {
  __remixContext?: {
    future?: FutureConfig;
  };
};

/**
 * Get the future flags from the Remix browser context
 *
 * @returns The future flags
 */
export function getFutureFlagsBrowser(): FutureConfig | undefined {
  const window = GLOBAL_OBJ as EnhancedGlobal;

  if (!window.__remixContext) {
    return;
  }

  return window.__remixContext.future;
}

/**
 * Get the future flags from the Remix server build
 *
 * @param build The Remix server build
 *
 * @returns The future flags
 */
export function getFutureFlagsServer(build: ServerBuild): FutureConfig | undefined {
  return build.future;
}
