import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce, NODE_VERSION } from '@sentry/node';
import { ReactRouterInstrumentation } from '../instrumentation/reactRouter';
import { registerServerBuildGlobal } from '../serverBuild';
import { enableOtelDataLoaderSpanCreation } from '../serverGlobals';

const INTEGRATION_NAME = 'ReactRouterServer';

const instrumentReactRouter = generateInstrumentOnce(INTEGRATION_NAME, () => {
  return new ReactRouterInstrumentation();
});

export const instrumentReactRouterServer = Object.assign(
  (): void => {
    instrumentReactRouter();
    // Register global for Vite plugin ServerBuild capture
    registerServerBuildGlobal();
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
      // Enable OTEL data-loader spans only on Node versions without the diagnostics_channel-based instrumentation API.
      if (
        (NODE_VERSION.major === 20 && NODE_VERSION.minor < 19) ||
        (NODE_VERSION.major === 22 && NODE_VERSION.minor < 12)
      ) {
        enableOtelDataLoaderSpanCreation();
      }

      // Always install to capture ServerBuild for middleware names.
      // Skips per-request wrapping when instrumentation API is active or OTEL span creation is disabled.
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
