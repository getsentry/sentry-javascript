import { hasSourceMapUploadCredentials } from '@sentry/bundler-plugins/core';
import { resolveSourceMapsFeatures } from '@sentry/core';
import type { SentryTanstackStartOptions } from './sentryTanstackStart';

/**
 * Whether Sentry turns on source maps that the user did not set: when it can upload them, or when
 * `sourcemaps.delete: false` keeps them for a manual upload.
 */
export function sentryEnablesSourceMaps(options: SentryTanstackStartOptions): boolean {
  const { injectDebugIds, upload } = resolveSourceMapsFeatures(options.sourcemaps);
  return (upload && hasSourceMapUploadCredentials(options)) || (options.sourcemaps?.delete === false && injectDebugIds);
}
