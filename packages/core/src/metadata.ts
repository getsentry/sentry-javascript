import { Options } from '@sentry/types';

import { SDK_VERSION } from './version';

const SDK_NAME_PREFIX = 'sentry.javascript';
const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

/** */
export function buildMetadata(options: Options, name: string, packageNames: string[]): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk = options._metadata.sdk || {
    name: `${SDK_NAME_PREFIX}.${name}`,
    packages: packageNames.map(name => ({
      name: `${PACKAGE_NAME_PREFIX}/${name}`,
      version: SDK_VERSION,
    })),
    version: SDK_VERSION,
  };
}
