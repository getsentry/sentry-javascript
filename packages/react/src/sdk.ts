import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit, SDK_VERSION } from '@sentry/browser';
import type { SdkMetadata } from '@sentry/types';

/**
 * Inits the React SDK
 */
export function init(options: BrowserOptions): void {
  const opts = {
    _metadata: {} as SdkMetadata,
    ...options,
  };

  opts._metadata.sdk = opts._metadata.sdk || {
    name: 'sentry.javascript.react',
    packages: [
      {
        name: 'npm:@sentry/react',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };
  browserInit(opts);
}
