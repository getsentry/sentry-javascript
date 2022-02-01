import { configureScope, init as reactInit, Integrations as BrowserIntegrations } from '@sentry/react';
import { BrowserTracing, defaultRequestInstrumentationOptions } from '@sentry/tracing';

import { nextRouterInstrumentation } from './performance/client';
import { buildMetadata } from './utils/metadata';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration, UserIntegrations } from './utils/userIntegrations';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './performance/client';

export const Integrations = { ...BrowserIntegrations, BrowserTracing };

// This is already exported as part of `Integrations` above (and for the moment will remain so for
// backwards compatibility), but that interferes with treeshaking, so we also export it separately
// here.
//
// Previously we expected users to import `BrowserTracing` like this:
//
// import { Integrations } from '@sentry/nextjs';
// const instance = new Integrations.BrowserTracing();
//
// This makes the integrations unable to be treeshaken though. To address this, we now have
// this individual export. We now expect users to consume BrowserTracing like so:
//
// import { BrowserTracing } from '@sentry/nextjs';
// const instance = new BrowserTracing();
export { BrowserTracing };

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
