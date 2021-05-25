import { configureScope, init as reactInit } from '@sentry/react';
import { Integrations } from '@sentry/tracing';

import { nextRouterInstrumentation } from './performance/client';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration, UserIntegrations } from './utils/userIntegrations';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './performance/client';

const { BrowserTracing } = Integrations;

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'react']);
  metadataBuilder.addSdkMetadata();
  options.environment = options.environment || process.env.NODE_ENV;

  // Only add BrowserTracing if a tracesSampleRate or tracesSampler is set
  const integrations =
    options.tracesSampleRate === undefined && options.tracesSampler === undefined
      ? options.integrations
      : createClientIntegrations(options.integrations);

  reactInit({
    ...options,
    integrations,
  });
  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}

const defaultBrowserTracingIntegration = new BrowserTracing({
  routingInstrumentation: nextRouterInstrumentation,
});

function createClientIntegrations(integrations?: UserIntegrations): UserIntegrations {
  if (integrations) {
    return addIntegration(defaultBrowserTracingIntegration, integrations, [
      ['options.routingInstrumentation', nextRouterInstrumentation],
    ]);
  } else {
    return [defaultBrowserTracingIntegration];
  }
}
