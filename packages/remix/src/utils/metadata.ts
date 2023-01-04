import { SDK_VERSION } from '@sentry/core';
import type { Options, SdkInfo } from '@sentry/types';

const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

/**
 * A builder for the SDK metadata in the options for the SDK initialization.
 * @param options sdk options object that gets mutated
 * @param names list of package names
 */
export function buildMetadata(options: Options, names: string[]): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk =
    options._metadata.sdk ||
    ({
      name: 'sentry.javascript.remix',
      packages: names.map(name => ({
        name: `${PACKAGE_NAME_PREFIX}${name}`,
        version: SDK_VERSION,
      })),
      version: SDK_VERSION,
    } as SdkInfo);
}
