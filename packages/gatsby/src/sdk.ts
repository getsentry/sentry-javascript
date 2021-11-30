import { buildMetadata, init as reactInit } from '@sentry/react';

import { getIntegrationsFromOptions } from './utils/integrations';
import { GatsbyOptions } from './utils/types';

const PACKAGE_NAME = 'gatsby';

/**
 * Inits the Sentry Gatsby SDK.
 */
export function init(options: GatsbyOptions): void {
  buildMetadata(options, PACKAGE_NAME, [PACKAGE_NAME]);

  const integrations = getIntegrationsFromOptions(options);
  reactInit({
    ...options,
    integrations,
  });
}
