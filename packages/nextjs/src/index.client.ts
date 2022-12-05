import { configureScope, init as reactInit, Integrations } from '@sentry/react';
import { BrowserTracing, defaultRequestInstrumentationOptions } from '@sentry/tracing';
import { EventProcessor } from '@sentry/types';

import { nextRouterInstrumentation } from './performance/client';
import { buildMetadata } from './utils/metadata';
import { NextjsOptions } from './utils/nextjsOptions';
import { addOrUpdateIntegration, UserIntegrations } from './utils/userIntegrations';

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

// This is a variable that Next.js will string replace during build with a string if run in an edge runtime from Next.js
// v12.2.1-canary.3 onwards:
// https://github.com/vercel/next.js/blob/166e5fb9b92f64c4b5d1f6560a05e2b9778c16fb/packages/next/build/webpack-config.ts#L206
declare const EdgeRuntime: string | undefined;

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  if (typeof EdgeRuntime === 'string') {
    // If the SDK is imported when using the Vercel Edge Runtime, it will import the browser SDK, even though it is
    // running the server part of a Next.js application. We can use the `EdgeRuntime` to check for that case and make
    // the init call a no-op. This will prevent the SDK from crashing on the Edge Runtime.
    return;
  }

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

function createClientIntegrations(userIntegrations: UserIntegrations = []): UserIntegrations {
  const defaultBrowserTracingIntegration = new BrowserTracing({
    // eslint-disable-next-line deprecation/deprecation
    tracingOrigins: [...defaultRequestInstrumentationOptions.tracingOrigins, /^(api\/)/],
    routingInstrumentation: nextRouterInstrumentation,
  });

  return addOrUpdateIntegration(defaultBrowserTracingIntegration, userIntegrations, {
    'options.routingInstrumentation': nextRouterInstrumentation,
  });
}
