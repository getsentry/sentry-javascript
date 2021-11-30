import { Options, SdkInfo } from '@sentry/types';

import { SDK_VERSION } from './version';

const SDK_NAME_PREFIX = 'sentry.javascript';
const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

/** */
export function buildMetadata(
  options: Options,
  name: string,
  packageNames: string[],
  integrations?: SdkInfo['integrations'],
): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk =
    options._metadata.sdk ||
    ({
      name: `${SDK_NAME_PREFIX}.${name}`,
      packages: packageNames.map(name => ({
        name: `${PACKAGE_NAME_PREFIX}/${name}`,
        version: SDK_VERSION,
      })),
      integrations,
      version: SDK_VERSION,
    } as SdkInfo);
}
