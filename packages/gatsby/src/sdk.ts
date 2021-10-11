import { init as reactInit, SDK_VERSION } from '@sentry/react';

import { getIntegrationsFromOptions } from './utils/integrations';
import { GatsbyOptions } from './utils/types';

export const defaultOptions = {
  autoSessionTracking: true,
  environment: process.env.NODE_ENV || 'development',
};

/**
 * Inits the Sentry Gatsby SDK.
 */
export function init(options: GatsbyOptions): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk = options._metadata.sdk || {
    name: 'sentry.javascript.gatsby',
    packages: [
      {
        name: 'npm:@sentry/gatsby',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  const integrations = getIntegrationsFromOptions(options);
  reactInit({
    ...defaultOptions,
    ...options,
    integrations,
  });
}
