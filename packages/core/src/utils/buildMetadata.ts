import type { Options, SdkInfo } from '@sentry/types';

import { SDK_VERSION } from '../version';

const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

/**
 * A builder for the SDK metadata in the options for the SDK initialization.
 *
 * @param options sdk options object that gets mutated
 * @param sdkName name of the SDK (e.g. 'nextjs')
 * @param packageNames list of package names (e.g. ['nextjs', 'react'])
 */
export function buildMetadata(options: Options, sdkName: string, packageNames: string[]): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk =
    options._metadata.sdk ||
    ({
      name: `sentry.javascript.${sdkName}`,
      packages: packageNames.map(name => ({
        name: `${PACKAGE_NAME_PREFIX}${name}`,
        version: SDK_VERSION,
      })),
      version: SDK_VERSION,
    } as SdkInfo);
}
