import { BrowserOptions, init as browserInit, SDK_VERSION } from '@sentry/browser';

/**
 * Inits the React SDK
 */
export function init(options: BrowserOptions): void {
  options._metadata = options._metadata || {};
  if (options._metadata.sdk === undefined) {
    options._metadata.sdk = {
      name: 'sentry.javascript.react',
      packages: [
        {
          name: 'npm:@sentry/react',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };
  }

  browserInit(options);
}
