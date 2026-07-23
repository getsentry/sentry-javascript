import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import { defineIntegration } from '@sentry/core';
import { registerServerBuildGlobal } from '../serverBuild';

const INTEGRATION_NAME = 'ReactRouterServer' as const;

/**
 * Integration capturing tracing data for React Router server functions.
 */
export const reactRouterServerIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // Register global for Vite plugin ServerBuild capture (used for middleware name resolution).
      registerServerBuildGlobal();
    },
    processEvent(event) {
      // The `@sentry/node` HTTP root span matches React Router's catch-all server handler, so it
      // carries a bogus `http.route` of `*`. The instrumentation API sets a proper route on requests
      // that hit a loader/action/middleware, but requests without one (e.g. SSR-only routes) keep the
      // placeholder - strip it here so it doesn't leak into the transaction.
      if (
        event.type === 'transaction' &&
        event.contexts?.trace?.data &&
        event.contexts.trace.data[HTTP_ROUTE] === '*'
      ) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete event.contexts.trace.data[HTTP_ROUTE];
      }

      return event;
    },
    processSegmentSpan(span) {
      // See `processEvent`: strip the bogus `*` route from the `@sentry/node` HTTP root span.
      const attributes = span.attributes;
      if (attributes?.[HTTP_ROUTE] === '*') {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete attributes[HTTP_ROUTE];
      }
    },
  };
});
