import { BrowserOptions, init as browserInit, SDK_VERSION } from '@sentry/browser';

/**
 * Inits the Svelte SDK
 */
export function init(options: BrowserOptions): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk = {
    name: 'sentry.javascript.svelte',
    packages: [
      {
        name: 'npm:@sentry/svelte',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  browserInit(options);
}
