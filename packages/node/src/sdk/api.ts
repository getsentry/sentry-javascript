// PUBLIC APIS

import type { StackParser } from '@sentry/core';
import { createStackParser, GLOBAL_OBJ } from '@sentry/core';
import { _INTERNAL_getReleaseFromCommitEnv as getReleaseFromCommitEnv, nodeStackLineParser } from '@sentry/core/server';
import { createGetModuleFromFilename } from '../utils/module';

/**
 * Returns a release dynamically from environment variables.
 */
export function getSentryRelease(fallback?: string): string | undefined {
  // Always read first as Sentry takes this as precedence
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE;
  }

  // This supports the variable that sentry-webpack-plugin injects
  if (GLOBAL_OBJ.SENTRY_RELEASE?.id) {
    return GLOBAL_OBJ.SENTRY_RELEASE.id;
  }

  return getReleaseFromCommitEnv() || fallback;
}

/** Node.js stack parser */
export const defaultStackParser: StackParser = createStackParser(nodeStackLineParser(createGetModuleFromFilename()));
