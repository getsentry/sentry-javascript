import { resolveSourceMapsFeatures } from '@sentry/core';
import type { SentryTanstackStartOptions } from './sentryTanstackStart';

/**
 * Whether Sentry turns on source maps that the user did not set: when it can upload them, or when
 * `sourcemaps.delete: false` keeps them for a manual upload.
 *
 * Only call this in a hook. The Sentry plugin loads `.env.sentry-build-plugin` into `process.env` when it is
 * created, and the credentials can come from there.
 */
export function sentryEnablesSourceMaps(options: SentryTanstackStartOptions): boolean {
  const { injectDebugIds, upload } = resolveSourceMapsFeatures(options.sourcemaps);
  return (upload && hasUploadCredentials(options)) || (options.sourcemaps?.delete === false && injectDebugIds);
}

/** The credentials checks of the Sentry plugin, which uploads nothing without them. */
function hasUploadCredentials(options: SentryTanstackStartOptions): boolean {
  const authToken = options.authToken ?? process.env.SENTRY_AUTH_TOKEN;
  const org = options.org ?? process.env.SENTRY_ORG;
  const project = options.project ?? process.env.SENTRY_PROJECT;
  return (
    !!authToken && (!!org || authToken.startsWith('sntrys_')) && (Array.isArray(project) ? !!project[0] : !!project)
  );
}
