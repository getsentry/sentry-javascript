import {
  captureException,
  configureScope,
  continueTrace,
  getActiveTransaction,
  SDK_VERSION,
  startTransaction,
} from '@sentry/core';
import type { Integration } from '@sentry/types';
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
  register: async function (serverArg: Record<any, any>) {
    const server = serverArg as unknown as Server;

    server.events.on('request', (request, event) => {
      const transaction = getActiveTransaction();

      if (request.response && isBoomObject(request.response)) {
        sendErrorToSentry(request.response);
      } else if (isErrorEvent(event)) {
        sendErrorToSentry(event.error);
      }

      if (transaction) {
        transaction.setStatus('internal_error');
        transaction.finish();
      }
    });
  },
};

export const hapiTracingPlugin = {
  name: 'SentryHapiTracingPlugin',
  version: SDK_VERSION,
  register: async function (serverArg: Record<any, any>) {
    const server = serverArg as unknown as Server;

    server.ext('onPreHandler', (request, h) => {
      const transaction = continueTrace(
        {
          sentryTrace: request.headers['sentry-trace'] || undefined,
          baggage: request.headers['baggage'] || undefined,
        },
        transactionContext => {
          return startTransaction({
            ...transactionContext,
            op: 'hapi.request',
            name: request.route.path,
            description: `${request.route.method} ${request.path}`,
          });
        },
      );

      configureScope(scope => {
        scope.setSpan(transaction);
      });

      return h.continue;
    });

    server.ext('onPreResponse', (request, h) => {
      const transaction = getActiveTransaction();

      if (request.response && isResponseObject(request.response) && transaction) {
        const response = request.response as ResponseObject;
        response.header('sentry-trace', transaction.toTraceparent());

        const dynamicSamplingContext = dynamicSamplingContextToSentryBaggageHeader(
          transaction.getDynamicSamplingContext(),
        );

        if (dynamicSamplingContext) {
          response.header('baggage', dynamicSamplingContext);
        }
      }

      return h.continue;
    });

    server.ext('onPostHandler', (request, h) => {
      const transaction = getActiveTransaction();

      if (request.response && isResponseObject(request.response) && transaction) {
        transaction.setHttpStatus(request.response.statusCode);
      }

      if (transaction) {
        transaction.finish();
      }

      return h.continue;
    });
  },
};

export type HapiOptions = {
  /** Hapi server instance */
  server?: Record<any, any>;
};

/**
 * Hapi Framework Integration
 */
export class Hapi implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Hapi';

  /**
   * @inheritDoc
   */
  public name: string;

  public _hapiServer: Server | undefined;

  public constructor(options?: HapiOptions) {
    if (options?.server) {
      const server = options.server as unknown as Server;

      this._hapiServer = server;
    }

    this.name = Hapi.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    if (!this._hapiServer) {
      return;
    }

    fill(this._hapiServer, 'start', (originalStart: () => void) => {
      return async function (this: Server) {
        await this.register(hapiTracingPlugin);
        await this.register(hapiErrorPlugin);
        const result = originalStart.apply(this);
        return result;
      };
    });
  }
}
