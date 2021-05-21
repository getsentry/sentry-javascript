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
  reactInit({
    ...options,
    integrations: createClientIntegrations(options.integrations),
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
    const newIntegrations = addIntegration(defaultBrowserTracingIntegration, integrations);
    if (Array.isArray(newIntegrations)) {
      newIntegrations.forEach(i => {
        if (i.name === 'BrowserTracing') {
          (i as InstanceType<typeof BrowserTracing>).options.routingInstrumentation = nextRouterInstrumentation;
        }
      });
    }
    return newIntegrations;
  } else {
    return [defaultBrowserTracingIntegration];
  }
}
