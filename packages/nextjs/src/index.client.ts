import { configureScope, init as reactInit, Integrations as BrowserIntegrations } from '@sentry/react';
import { BrowserTracing, defaultRequestInstrumentationOptions } from '@sentry/tracing';

import { nextRouterInstrumentation } from './performance/client';
import { buildMetadata } from './utils/metadata';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration, UserIntegrations } from './utils/userIntegrations';
import { addScopeEventProcessor } from '@sentry/hub';
import { setScopeTag } from '@sentry/hub/dist/scope';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './performance/client';

export const Integrations = { ...BrowserIntegrations, BrowserTracing };

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  buildMetadata(options, ['nextjs', 'react']);
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
    setScopeTag(scope, 'runtime', 'browser');
    addScopeEventProcessor(scope, event =>
      event.type === 'transaction' && event.transaction === '/404' ? null : event,
    );
  });
}

const defaultBrowserTracingIntegration = new BrowserTracing({
  tracingOrigins: [...defaultRequestInstrumentationOptions.tracingOrigins, /^(api\/)/],
  routingInstrumentation: nextRouterInstrumentation,
});

function createClientIntegrations(integrations?: UserIntegrations): UserIntegrations {
  if (integrations) {
    return addIntegration(defaultBrowserTracingIntegration, integrations, {
      BrowserTracing: { keyPath: 'options.routingInstrumentation', value: nextRouterInstrumentation },
    });
  } else {
    return [defaultBrowserTracingIntegration];
  }
}
