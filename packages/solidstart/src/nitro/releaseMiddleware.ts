import { addReleaseMetaTag } from './releaseMetaTag';

declare const __SENTRY_SOLIDSTART_RELEASE__: string | undefined;

/**
 * Hands the release to the browser SDK through a `<meta>` tag in each page on SolidStart 2 (Nitro v3), so it stays
 * out of the content-hashed client chunks. `sentrySolidStart` registers it as a Nitro middleware and defines the
 * release for the server environments.
 */
export default async function sentryReleaseMiddleware(_event: unknown, next: () => unknown): Promise<unknown> {
  const response = await next();
  const release = typeof __SENTRY_SOLIDSTART_RELEASE__ !== 'undefined' ? __SENTRY_SOLIDSTART_RELEASE__ : undefined;

  return release && response instanceof Response ? addReleaseMetaTag(response, release, undefined) : response;
}
