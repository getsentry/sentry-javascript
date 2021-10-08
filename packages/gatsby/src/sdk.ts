import { init as reactInit } from '@sentry/react';

import { getIntegrationsFromOptions } from './utils/integrations';
import { MetadataBuilder } from './utils/metadataBuilder';
import { GatsbyOptions } from './utils/types';

export const defaultOptions = {
  autoSessionTracking: true,
  environment: process.env.NODE_ENV || 'development',
};

/**
 * Inits the Sentry Gatsby SDK.
 */
export function init(options: GatsbyOptions): void {
  new MetadataBuilder(options, ['gatsby']).addSdkMetadata();
  const integrations = getIntegrationsFromOptions(options);
  reactInit({
    ...defaultOptions,
    ...options,
    integrations,
  });
}
