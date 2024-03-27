import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import {
  SDK_VERSION,
  SPAN_STATUS_ERROR,
  captureException,
  defineIntegration,
  getActiveSpan,
  getRootSpan,
} from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import type { Boom, RequestEvent, ResponseObject, Server } from './types';

const _hapiIntegration = (() => {
  return {
    name: 'Hapi',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new HapiInstrumentation()],
      });
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
}
