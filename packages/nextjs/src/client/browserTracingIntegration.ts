import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/react';
import type { Integration } from '@sentry/types';
import { nextRouterInstrumentNavigation, nextRouterInstrumentPageLoad } from './routing/nextRoutingInstrumentation';

/**
 * A custom browser tracing integration for Next.js.
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  const { instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      // We need to run the navigation span instrumentation before the `afterAllSetup` hook on the normal browser
      // tracing integration because we need to ensure the order of execution is as follows:
      // Instrumentation to start span on RSC fetch request runs -> Instrumentation to put tracing headers from active span on fetch runs
      // If it were the other way around, the RSC fetch request would not receive the tracing headers from the navigation transaction.
      if (instrumentNavigation) {
        nextRouterInstrumentNavigation(client);
      }

      browserTracingIntegrationInstance.afterAllSetup(client);

      if (instrumentPageLoad) {
        nextRouterInstrumentPageLoad(client);
      }
    },
  };
}
