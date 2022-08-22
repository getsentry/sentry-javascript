import { configureScope, init as reactInit, Integrations } from '@sentry/react';
import { BrowserTracing, defaultRequestInstrumentationOptions } from '@sentry/tracing';
import { EventProcessor } from '@sentry/types';

import { nextRouterInstrumentation } from './performance/client';
import { buildMetadata } from './utils/metadata';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration, UserIntegrations } from './utils/userIntegrations';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './performance/client';
export { captureUnderscoreErrorException } from './utils/_error';

export { Integrations };

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

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  buildMetadata(options, ['nextjs', 'react']);
  options.environment = options.environment || process.env.NODE_ENV;

  let integrations = options.integrations;

  // Guard below evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false"
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    // Only add BrowserTracing if a tracesSampleRate or tracesSampler is set
    if (options.tracesSampleRate !== undefined || options.tracesSampler !== undefined) {
      integrations = createClientIntegrations(options.integrations);
    }
  }

  reactInit({
    ...options,
    integrations,
  });

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
    const filterTransactions: EventProcessor = event =>
      event.type === 'transaction' && event.transaction === '/404' ? null : event;
    filterTransactions.id = 'NextClient404Filter';
    scope.addEventProcessor(filterTransactions);
  });
}

function createClientIntegrations(integrations?: UserIntegrations): UserIntegrations {
  const defaultBrowserTracingIntegration = new BrowserTracing({
    tracingOrigins: [...defaultRequestInstrumentationOptions.tracingOrigins, /^(api\/)/],
    routingInstrumentation: nextRouterInstrumentation,
  });

  if (integrations) {
    return addIntegration(defaultBrowserTracingIntegration, integrations, {
      BrowserTracing: { keyPath: 'options.routingInstrumentation', value: nextRouterInstrumentation },
    });
  } else {
    return [defaultBrowserTracingIntegration];
  }
}
