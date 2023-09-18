import { GLOBAL_OBJ } from '@sentry/utils';

import type { FutureConfig, ServerBuild } from './vendor/types';

export type EnhancedGlobal = typeof GLOBAL_OBJ & {
  __remixContext?: {
    future?: FutureConfig;
    state?: {
      loaderData?: {
        root?: {
          remixVersion?: number;
        };
      };
    };
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

/**
 * Learn Remix version from the server build object
 * V2 Server builds have a non-optional `mode` property
 *
 * @returns The major version number
 */
export function getRemixVersionFromBuild(build: ServerBuild): number {
  if ('mode' in build) {
    return 2;
  }

  return 1;
}

/**
 * Read Remix version from the Remix context on the browser
 *
 * @returns The major version number
 */
export function readRemixVersionFromLoader(): number | undefined {
  const window = GLOBAL_OBJ as EnhancedGlobal;

  return window.__remixContext?.state?.loaderData?.root?.remixVersion;
}
