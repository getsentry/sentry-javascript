import { configureScope, init as nodeInit } from '@sentry/node';

import { InitDecider } from './utils/initDecider';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

export * from '@sentry/node';

// Here we want to make sure to only include what doesn't have browser specifics
// because or SSR of next.js we can only use this.
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): any {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'node']);
  metadataBuilder.addSdkMetadata();
  const initDecider = new InitDecider(options);
  if (initDecider.shouldInitSentry()) {
    nodeInit(options);
    configureScope(scope => {
      scope.setTag('runtime', 'node');
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[Sentry] Detected a non-production environment. Not initializing Sentry.');
    // eslint-disable-next-line no-console
    console.warn('[Sentry] To use Sentry also in development set `dev: true` in the options.');
  }
}

/** Does nothing, added for compatibility reasons. */
export function addBrowserConfig(_options: any): void {
  // NOOP
}
