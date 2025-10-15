import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce, NODE_VERSION } from '@sentry/node';
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
      if (
        (NODE_VERSION.major === 20 && NODE_VERSION.minor < 19) || // https://nodejs.org/en/blog/release/v20.19.0
        (NODE_VERSION.major === 22 && NODE_VERSION.minor < 12) // https://nodejs.org/en/blog/release/v22.12.0
      ) {
        instrumentReactRouterServer();
      }
    },
    // TODO (span-streaming): port this logic to spans via a hook or ignoreSpans default;
    processEvent(event) {
      // Express generates bogus `*` routes for data loaders, which we want to remove here
      // we cannot do this earlier because some OTEL instrumentation adds this at some unexpected point
      if (
        event.type === 'transaction' &&
        event.contexts?.trace?.data &&
        event.contexts.trace.data[ATTR_HTTP_ROUTE] === '*' &&
        // This means the name has been adjusted before, but the http.route remains, so we need to remove it
        event.transaction !== 'GET *' &&
        event.transaction !== 'POST *'
      ) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete event.contexts.trace.data[ATTR_HTTP_ROUTE];
      }

      return event;
    },
  };
});
