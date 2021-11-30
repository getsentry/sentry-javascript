import { SdkMetadata } from '@sentry/types';

import { SDK_VERSION } from './version';

const SDK_NAME_PREFIX = 'sentry.javascript';
const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

/** */
export function buildMetadata(name: string, packageNames: string[], metadata: SdkMetadata = {}): SdkMetadata {
  metadata.sdk = metadata.sdk || {
    name: `${SDK_NAME_PREFIX}.${name}`,
    packages: packageNames.map(name => ({
      name: `${PACKAGE_NAME_PREFIX}/${name}`,
      version: SDK_VERSION,
    })),
    version: SDK_VERSION,
  };

  return metadata;
}
