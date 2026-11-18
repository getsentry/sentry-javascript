import { RELEASE_SERVER_TIMING_NAME } from '../../common/utils/releaseServerTiming';
import type { NextConfigObject, SentryBuildOptions } from '../types';

/**
 * Whether the release goes into the client bundles. A static export has no server to send it in a header, so it
 * always does.
 */
export function shouldInjectReleaseIntoClient(
  userNextConfig: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): boolean {
  return userSentryOptions.release?.inject !== false || userNextConfig.output === 'export';
}

/**
 * Adds the release in a `Server-Timing` header to every response outside of `/_next/`, for the browser SDK to read
 * from the document response when the release is not in the client bundles.
 *
 * Note: this mutates `userNextConfig`.
 */
export function maybeAddReleaseServerTimingHeader(
  userNextConfig: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
  releaseName: string | undefined,
): void {
  if (!releaseName || shouldInjectReleaseIntoClient(userNextConfig, userSentryOptions)) {
    return;
  }

  // Encoded, so the value is valid in a header and has no `:` that Next.js would read as a path parameter.
  const value = `${RELEASE_SERVER_TIMING_NAME};desc="${encodeURIComponent(releaseName)}"`;
  const originalHeaders = userNextConfig.headers;
  userNextConfig.headers = async () => [
    // First, because Next.js lets the last matching header with the same key win, and the app's own
    // `Server-Timing` header should not be replaced.
    { source: '/:path((?!_next/).*)', locale: false, headers: [{ key: 'Server-Timing', value }] },
    ...((await originalHeaders?.()) ?? []),
  ];
}
