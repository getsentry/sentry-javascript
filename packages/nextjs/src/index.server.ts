import { configureScope, init as nodeInit } from '@sentry/node';

import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';
import { getFinalServerIntegrations, REWRITE_FRAMES_INTEGRATION } from './utils/serverIntegrations';

export * from '@sentry/node';

// Here we want to make sure to only include what doesn't have browser specifics
// because or SSR of next.js we can only use this.
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'node']);
  metadataBuilder.addSdkMetadata();
  if (options.integrations) {
    options.integrations = getFinalServerIntegrations(options.integrations);
  } else {
    options.integrations = [REWRITE_FRAMES_INTEGRATION];
  }

  nodeInit(options);
  configureScope(scope => {
    scope.setTag('runtime', 'node');
  });
}
