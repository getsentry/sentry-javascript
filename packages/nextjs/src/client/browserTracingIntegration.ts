import type { Integration } from '@sentry/core';
import { browserTracingIntegration as originalBrowserTracingIntegration, isBotUserAgent } from '@sentry/react';
import { settlePendingPageloadWait } from './routing/appRouterRoutingInstrumentation';
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
    onRequestSpanStart(...args) {
      const [span, { headers }] = args;

      // Next.js prefetch requests have a `next-router-prefetch` header
      if (headers?.get('next-router-prefetch')) {
        span?.setAttribute('http.request.prefetch', true);
      }

      return options.onRequestSpanStart?.(...args);
    },
  });

  const { instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      if (isBotUserAgent()) {
        return;
      }

      // We need to run the navigation span instrumentation before the `afterAllSetup` hook on the normal browser
      // tracing integration because we need to ensure the order of execution is as follows:
      // Instrumentation to start span on RSC fetch request runs -> Instrumentation to put tracing headers from active span on fetch runs
      // If it were the other way around, the RSC fetch request would not receive the tracing headers from the navigation transaction.
      if (instrumentNavigation) {
        nextRouterInstrumentNavigation(client);
      }

      // Registered before the browser tracing integration's own handler, which creates the navigation
      // span: a pageload that is still waiting for its trace meta tag has to exist by then, so the
      // handler ends it like any pageload a navigation interrupts. Started later, the pageload would
      // end the navigation span instead.
      if (instrumentPageLoad) {
        client.on('startNavigationSpan', settlePendingPageloadWait);
      }

      browserTracingIntegrationInstance.afterAllSetup(client);

      if (instrumentPageLoad) {
        nextRouterInstrumentPageLoad(client);
      }
    },
  };
}
