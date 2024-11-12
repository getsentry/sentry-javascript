import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../../../debug-build';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { ensureIsWrapped } from '../../../utils/ensureIsWrapped';
import type { Request, RequestEvent, Server } from './types';

const INTEGRATION_NAME = 'Hapi';

export const instrumentHapi = generateInstrumentOnce(INTEGRATION_NAME, () => new HapiInstrumentation());

const _hapiIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentHapi();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Hapi](https://hapi.dev/).
 *
 * If you also want to capture errors, you need to call `setupHapiErrorHandler(server)` after you set up your server.
 *
 * For more information, see the [hapi documentation](https://docs.sentry.io/platforms/javascript/guides/hapi/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.hapiIntegration()],
 * })
 * ```
 */
export const hapiIntegration = defineIntegration(_hapiIntegration);

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

    server.events.on({ name: 'request', channels: ['error'] }, (request: Request, event: RequestEvent) => {
      if (getIsolationScope() !== getDefaultIsolationScope()) {
        const route = request.route;
        if (route && route.path) {
          getIsolationScope().setTransactionName(`${route.method?.toUpperCase() || 'GET'} ${route.path}`);
        }
      } else {
        DEBUG_BUILD &&
          logger.warn('Isolation scope is still the default isolation scope - skipping setting transactionName');
      }

      if (isErrorEvent(event)) {
        sendErrorToSentry(event.error);
      }
    });
  },
};

/**
 * Add a Hapi plugin to capture errors to Sentry.
 *
 * @param server The Hapi server to attach the error handler to
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const Hapi = require('@hapi/hapi');
 *
 * const init = async () => {
 *   const server = Hapi.server();
 *
 *   // all your routes here
 *
 *   await Sentry.setupHapiErrorHandler(server);
 *
 *   await server.start();
 * };
 * ```
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
  ensureIsWrapped(server.register, 'hapi');
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
