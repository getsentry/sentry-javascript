import { init as browserInit, SDK_VERSION } from '@sentry/browser';

import { NextjsOptions } from './options';

/**
 * The Sentry NextJS SDK Client.
 *
 * TODO: docs, examples...
 *
 */
export function init(options: NextjsOptions): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk = {
    name: 'sentry.javascript.nextjs',
    packages: [
      {
        name: '', // TODO
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };
  browserInit(options);
}
