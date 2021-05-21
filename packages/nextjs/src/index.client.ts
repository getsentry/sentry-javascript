import { configureScope, init as reactInit } from '@sentry/react';
import { Integrations } from '@sentry/tracing';

import { nextRouterInstrumentation } from './performance/client';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration } from './utils/userIntegrations';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './performance/client';

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  options.environment = options.environment || process.env.NODE_ENV;
  addClientIntegrations(options);
  reactInit(options);
  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}

const defaultBrowserTracingIntegration = new Integrations.BrowserTracing({
  routingInstrumentation: nextRouterInstrumentation,
});

function addClientIntegrations(options: NextjsOptions): void {
  if (options.integrations) {
    addIntegration(defaultBrowserTracingIntegration, options.integrations);
  } else {
    options.integrations = [defaultBrowserTracingIntegration];
  }
}
