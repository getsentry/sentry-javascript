import { resolveReleaseName } from '@sentry/bundler-plugins/core';
import { stringifyForCodeInjection } from '@sentry/core';
import type { SentryTanstackStartOptions } from './sentryTanstackStart';

/**
 * The release the SDK delivers at runtime instead of the bundler plugin injecting it into the startup chunks, whose
 * content hashes would change with every release. Undefined when `release.inject` is `false` or there is no release.
 */
export function getRuntimeRelease(options: SentryTanstackStartOptions): string | undefined {
  if (options.release?.inject === false) {
    return undefined;
  }

  return resolveReleaseName(options.release?.name);
}

/** Sets the release where the server SDK reads it on `init`, the same way the bundler plugin does. */
export function getServerReleaseCode(release: string): string {
  return `globalThis.SENTRY_RELEASE = { id: ${stringifyForCodeInjection(release)} };\n`;
}
