import { buildMetadata, configureScope, init as reactInit, Integrations as BrowserIntegrations } from '@sentry/react';
import { defaultRequestInstrumentationOptions, Integrations as TracingIntegrations } from '@sentry/tracing';

import { NEXTJS_PACKAGE_NAME, REACT_PACKAGE_NAME } from './constants';
import { nextRouterInstrumentation } from './performance/client';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration, UserIntegrations } from './utils/userIntegrations';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './performance/client';

const { BrowserTracing } = TracingIntegrations;
export const Integrations = { ...BrowserIntegrations, BrowserTracing };

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  options._metadata = buildMetadata(NEXTJS_PACKAGE_NAME, [NEXTJS_PACKAGE_NAME, REACT_PACKAGE_NAME], options._metadata);
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
    scope.addEventProcessor(event => (event.type === 'transaction' && event.transaction === '/404' ? null : event));
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
