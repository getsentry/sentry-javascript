import {
  SDK_VERSION,
  captureException,
  continueTrace,
  convertIntegrationFnToClass,
  defineIntegration,
  getActiveSpan,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  setHttpStatus,
  spanToTraceHeader,
  startInactiveSpan,
} from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { dynamicSamplingContextToSentryBaggageHeader, fill } from '@sentry/utils';

import type { Boom, RequestEvent, ResponseObject, Server } from './types';

function isResponseObject(response: ResponseObject | Boom): response is ResponseObject {
  return response && (response as ResponseObject).statusCode !== undefined;
}

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
      const span = getActiveSpan();

      if (request.response && isBoomObject(request.response)) {
        sendErrorToSentry(request.response);
      } else if (isErrorEvent(event)) {
        sendErrorToSentry(event.error);
      }

      if (span) {
        span.setStatus('internal_error');
        span.end();
      }
    });
  },
};

export const hapiTracingPlugin = {
  name: 'SentryHapiTracingPlugin',
  version: SDK_VERSION,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: async function (serverArg: Record<any, any>) {
    const server = serverArg as unknown as Server;

    server.ext('onPreHandler', (request, h) => {
      const span = continueTrace(
        {
          sentryTrace: request.headers['sentry-trace'] || undefined,
          baggage: request.headers['baggage'] || undefined,
        },
        () => {
          // eslint-disable-next-line deprecation/deprecation
          return startInactiveSpan({
            op: 'hapi.request',
            name: request.route.path,
            description: `${request.route.method} ${request.path}`,
          });
        },
      );

      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(span);

      return h.continue;
    });

    server.ext('onPreResponse', (request, h) => {
      const span = getActiveSpan();

      if (request.response && isResponseObject(request.response) && span) {
        const response = request.response as ResponseObject;
        response.header('sentry-trace', spanToTraceHeader(span));

        const dynamicSamplingContext = dynamicSamplingContextToSentryBaggageHeader(
          getDynamicSamplingContextFromSpan(span),
        );

        if (dynamicSamplingContext) {
          response.header('baggage', dynamicSamplingContext);
        }
      }

      return h.continue;
    });

    server.ext('onPostHandler', (request, h) => {
      const span = getActiveSpan();

      if (span) {
        if (request.response && isResponseObject(request.response)) {
          setHttpStatus(span, request.response.statusCode);
        }

        span.end();
      }

      return h.continue;
    });
  },
};

export type HapiOptions = {
  /** Hapi server instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server?: Record<any, any>;
};

const INTEGRATION_NAME = 'Hapi';

const _hapiIntegration = ((options: HapiOptions = {}) => {
  const server = options.server as undefined | Server;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!server) {
        return;
      }

      fill(server, 'start', (originalStart: () => void) => {
        return async function (this: Server) {
          await this.register(hapiTracingPlugin);
          await this.register(hapiErrorPlugin);
          const result = originalStart.apply(this);
          return result;
        };
      });
    },
  };
}) satisfies IntegrationFn;

export const hapiIntegration = defineIntegration(_hapiIntegration);

/**
 * Hapi Framework Integration.
 * @deprecated Use `hapiIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const Hapi = convertIntegrationFnToClass(INTEGRATION_NAME, hapiIntegration);

// eslint-disable-next-line deprecation/deprecation
export type Hapi = typeof Hapi;
