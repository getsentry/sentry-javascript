import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/react';
import type { Integration, StartSpanOptions } from '@sentry/types';
import { nextRouterInstrumentation } from './routing/nextRoutingInstrumentation';

/**
 * A custom BrowserTracing integration for Next.js.
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      const startPageloadCallback = (startSpanOptions: StartSpanOptions): void => {
        startBrowserTracingPageLoadSpan(client, startSpanOptions);
      };

      const startNavigationCallback = (startSpanOptions: StartSpanOptions): void => {
        startBrowserTracingNavigationSpan(client, startSpanOptions);
      };

      // We need to run the navigation span instrumentation before the `afterAllSetup` hook on the normal browser
      // tracing integration because we need to ensure the order of execution is as follows:
      // Instrumentation to start span on RSC fetch request runs -> Instrumentation to put tracing headers from active span on fetch runs
      // If it were the other way around, the RSC fetch request would not receive the tracing headers from the navigation transaction.
      nextRouterInstrumentation(
        false,
        options.instrumentNavigation === undefined ? true : options.instrumentNavigation,
        startPageloadCallback,
        startNavigationCallback,
      );

      browserTracingIntegrationInstance.afterAllSetup(client);

      nextRouterInstrumentation(
        options.instrumentPageLoad === undefined ? true : options.instrumentPageLoad,
        false,
        startPageloadCallback,
        startNavigationCallback,
      );
    },
  };
}
