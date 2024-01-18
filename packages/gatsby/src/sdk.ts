import { applySdkMetadata } from '@sentry/core';
import { init as reactInit } from '@sentry/react';

import { getIntegrationsFromOptions } from './utils/integrations';
import type { GatsbyOptions } from './utils/types';

/**
 * Inits the Sentry Gatsby SDK.
 */
export function init(options: GatsbyOptions): void {
  applySdkMetadata(options, 'gatsby');
  const integrations = getIntegrationsFromOptions(options);
  reactInit({
    ...options,
    integrations,
  });
}
