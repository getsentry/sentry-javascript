import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import { ReactRouterInstrumentation } from '../instrumentation/reactRouter';

const INTEGRATION_NAME = 'ReactRouterServer';

const instrumentReactRouter = generateInstrumentOnce(INTEGRATION_NAME, () => {
  return new ReactRouterInstrumentation();
});

export const instrumentReactRouterServer = Object.assign(
  (): void => {
    instrumentReactRouter();
  },
  { id: INTEGRATION_NAME },
);

/**
 * Integration capturing tracing data for React Router server functions.
 */
export const reactRouterServerIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // Install OTEL instrumentation to capture ServerBuild for middleware name resolution.
      // When instrumentation API is active, the wrapper captures ServerBuild but skips
      // per-request wrapping. On Node 20.19+/22.12+, users must import
      // '@sentry/react-router/loader' first for ESM patching; otherwise names fall back to routeId.
      instrumentReactRouterServer();
    },
    processEvent(event) {
      // Express generates bogus `*` routes for data loaders, which we want to remove here
      // we cannot do this earlier because some OTEL instrumentation adds this at some unexpected point
      if (
        event.type === 'transaction' &&
        event.contexts?.trace?.data &&
        event.contexts.trace.data[ATTR_HTTP_ROUTE] === '*'
      ) {
        const origin = event.contexts.trace.origin;
        const isInstrumentationApiOrigin = origin?.includes('instrumentation_api');

        // For instrumentation_api, always clean up bogus `*` route since we set better names
        // For legacy, only clean up if the name has been adjusted (not METHOD *)
        if (isInstrumentationApiOrigin || !event.transaction?.endsWith(' *')) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete event.contexts.trace.data[ATTR_HTTP_ROUTE];
        }
      }

      return event;
    },
  };
});
