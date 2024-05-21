import { isWrapped } from '@opentelemetry/core';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  captureException,
  defineIntegration,
  getActiveSpan,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  getRootSpan,
  isEnabled,
  spanToJSON,
} from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn, Span } from '@sentry/types';
import { consoleSandbox, logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../../../debug-build';
import type { Boom, RequestEvent, ResponseObject, Server } from './types';

const _hapiIntegration = (() => {
  return {
    name: 'Hapi',
    setupOnce() {
      addOpenTelemetryInstrumentation(new HapiInstrumentation());
    },
  };
}) satisfies IntegrationFn;

/**
 * Hapi integration
 *
 * Capture tracing data for Hapi.
 * If you also want to capture errors, you need to call `setupHapiErrorHandler(server)` after you set up your server.
 */
export const hapiIntegration = defineIntegration(_hapiIntegration);

function isBoomObject(response: ResponseObject | Boom): response is Boom {
  return response && (response as Boom).isBoom !== undefined;
}

function isErrorEvent(event: RequestEvent): event is RequestEvent {
  return event && (event as RequestEvent).error !== undefined;
}

function sendErrorToSentry(errorData: object): void {
  captureException(errorData, {
    mechanism: {
      type: 'hapi',
      handled: false,
      data: {
        function: 'hapiErrorPlugin',
      },
    },
  });
}

export const hapiErrorPlugin = {
  name: 'SentryHapiErrorPlugin',
  version: SDK_VERSION,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: async function (serverArg: Record<any, any>) {
    const server = serverArg as unknown as Server;

    server.events.on('request', (request, event) => {
      if (getIsolationScope() !== getDefaultIsolationScope()) {
        const route = request.route;
        if (route && route.path) {
          getIsolationScope().setTransactionName(`${route.method?.toUpperCase() || 'GET'} ${route.path}`);
        }
      } else {
        DEBUG_BUILD &&
          logger.warn('Isolation scope is still the default isolation scope - skipping setting transactionName');
      }

      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

      if (request.response && isBoomObject(request.response)) {
        sendErrorToSentry(request.response);
      } else if (isErrorEvent(event)) {
        sendErrorToSentry(event.error);
      }

      if (rootSpan) {
        rootSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        rootSpan.end();
      }
    });
  },
};

/**
 * Add a Hapi plugin to capture errors to Sentry.
 */
export async function setupHapiErrorHandler(server: Server): Promise<void> {
  await server.register(hapiErrorPlugin);

  // Sadly, middleware spans do not go through `requestHook`, so we handle those here
  // We register this hook in this method, because if we register it in the integration `setup`,
  // it would always run even for users that are not even using hapi
  const client = getClient();
  if (client) {
    client.on('spanStart', span => {
      addHapiSpanAttributes(span);
    });
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  if (!isWrapped(server.register) && isEnabled()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Hapi is not instrumented. This is likely because you required/imported hapi before calling `Sentry.init()`.',
      );
    });
  }
}

function addHapiSpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data || {};

  // this is one of: router, plugin, server.ext
  const type = attributes['hapi.type'];

  // If this is already set, or we have no Hapi span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.hapi',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.hapi`,
  });
}
