// PUBLIC APIS

import type { StackParser } from '@sentry/types';
import { GLOBAL_OBJ, createStackParser, nodeStackLineParser } from '@sentry/utils';
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
  if (GLOBAL_OBJ.SENTRY_RELEASE && GLOBAL_OBJ.SENTRY_RELEASE.id) {
    return GLOBAL_OBJ.SENTRY_RELEASE.id;
  }

  return (
    // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
    process.env.GITHUB_SHA ||
    // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    process.env.COMMIT_REF ||
    // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GITHUB_COMMIT_SHA ||
    process.env.VERCEL_GITLAB_COMMIT_SHA ||
    process.env.VERCEL_BITBUCKET_COMMIT_SHA ||
    // Zeit (now known as Vercel)
    process.env.ZEIT_GITHUB_COMMIT_SHA ||
    process.env.ZEIT_GITLAB_COMMIT_SHA ||
    process.env.ZEIT_BITBUCKET_COMMIT_SHA ||
    // Cloudflare Pages - https://developers.cloudflare.com/pages/platform/build-configuration/#environment-variables
    process.env.CF_PAGES_COMMIT_SHA ||
    fallback
  );
}

/** Node.js stack parser */
export const defaultStackParser: StackParser = createStackParser(nodeStackLineParser(createGetModuleFromFilename()));
