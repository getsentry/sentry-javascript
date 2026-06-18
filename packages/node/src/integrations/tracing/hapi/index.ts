import { HapiInstrumentation } from './vendored/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import {
  captureException,
  debug,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
  SDK_VERSION,
} from '@sentry/core';
import { ensureIsWrapped, generateInstrumentOnce } from '@sentry/node-core';
import { DEBUG_BUILD } from '../../../debug-build';
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

function isErrorEvent(event: unknown): event is RequestEvent {
  return !!(event && typeof event === 'object' && 'error' in event && event.error);
}

function sendErrorToSentry(errorData: object): void {
  captureException(errorData, {
    mechanism: {
      type: 'auto.function.hapi',
      handled: false,
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
        if (route.path) {
          getIsolationScope().setTransactionName(`${route.method.toUpperCase()} ${route.path}`);
        }
      } else {
        DEBUG_BUILD &&
          debug.warn('Isolation scope is still the default isolation scope - skipping setting transactionName');
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
  ensureIsWrapped(server.register, 'hapi');
}
