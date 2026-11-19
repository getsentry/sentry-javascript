import type { Client, Event, IntegrationFn, Primitive, StackParser } from '@sentry/core';
import type { ServerRuntimeClient } from '@sentry/core/server';
import {
  captureEvent,
  defineIntegration,
  eventFromUnknownInput,
  flush,
  getClient,
  isObjectLike,
  isPrimitive,
} from '@sentry/core';
import process from 'node:process';

type GlobalHandlersIntegrationsOptionKeys = 'error' | 'unhandledrejection';

type GlobalHandlersIntegrations = Record<GlobalHandlersIntegrationsOptionKeys, boolean>;

const INTEGRATION_NAME = 'GlobalHandlers' as const;
let isExiting = false;

// Deno turns a throw at the top level of the CommonJS entry module into a rejection of the module
// evaluation, so it reaches the `unhandledrejection` listener. It first passes the error to the
// `uncaughtExceptionMonitor` listeners as an uncaught exception.
const uncaughtExceptions = new WeakSet<object>();

const _globalHandlersIntegration = ((options?: GlobalHandlersIntegrations) => {
  const _options = {
    error: true,
    unhandledrejection: true,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (_options.error) {
        installGlobalErrorHandler(client);
      }
      if (_options.unhandledrejection) {
        installGlobalUnhandledRejectionHandler(client);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments global `error` and `unhandledrejection` listeners in Deno.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.globalHandlersIntegration(),
 *   ],
 * })
 * ```
 */
export const globalHandlersIntegration = defineIntegration(_globalHandlersIntegration);

function installGlobalErrorHandler(client: Client): void {
  globalThis.addEventListener('error', data => {
    if (getClient() !== client || isExiting) {
      return;
    }

    const { message, error } = data;
    captureUncaughtException(client, error || message, error);

    // Stop the app from exiting for now
    data.preventDefault();
    exitAfterFlush(error);
  });
}

function captureUncaughtException(client: Client, exception: unknown, originalException: unknown): void {
  const event = eventFromUnknownInput(client, getStackParser(), exception);

  event.level = 'fatal';

  captureEvent(event, {
    originalException,
    mechanism: {
      handled: false,
      type: 'auto.deno.global_handlers.error',
    },
  });
}

function exitAfterFlush(error: unknown): void {
  isExiting = true;

  flush().then(
    () => {
      // rethrow to replicate Deno default behavior
      throw error;
    },
    () => {
      // rethrow to replicate Deno default behavior
      throw error;
    },
  );
}

function recordUncaughtException(error: unknown, origin: string): void {
  if (origin === 'uncaughtException' && isObjectLike(error)) {
    uncaughtExceptions.add(error);
  }
}

function installGlobalUnhandledRejectionHandler(client: Client): void {
  if (!process.listeners('uncaughtExceptionMonitor').includes(recordUncaughtException)) {
    process.on('uncaughtExceptionMonitor', recordUncaughtException);
  }

  globalThis.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (getClient() !== client || isExiting || client.getIntegrationByName('OnUnhandledRejection')) {
      return;
    }

    const stackParser = getStackParser();
    let error = e;

    // dig the object of the rejection out of known event types
    try {
      if ('reason' in e) {
        error = e.reason;
      }
    } catch {
      // no-empty
    }

    if (isObjectLike(error) && uncaughtExceptions.has(error)) {
      captureUncaughtException(client, error, error);
    } else {
      const event = isPrimitive(error)
        ? eventFromRejectionWithPrimitive(error)
        : eventFromUnknownInput(client, stackParser, error, undefined);

      event.level = 'fatal';

      captureEvent(event, {
        originalException: error,
        mechanism: {
          handled: false,
          type: 'auto.deno.global_handlers.unhandledrejection',
        },
      });
    }

    // Stop the app from exiting for now
    e.preventDefault();
    exitAfterFlush(error);
  });
}

/**
 * Create an event from a promise rejection where the `reason` is a primitive.
 *
 * @param reason: The `reason` property of the promise rejection
 * @returns An Event object with an appropriate `exception` value
 */
function eventFromRejectionWithPrimitive(reason: Primitive): Event {
  return {
    exception: {
      values: [
        {
          type: 'UnhandledRejection',
          // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
          value: `Non-Error promise rejection captured with value: ${String(reason)}`,
        },
      ],
    },
  };
}

function getStackParser(): StackParser {
  const client = getClient<ServerRuntimeClient>();

  if (!client) {
    return () => [];
  }

  return client.getOptions().stackParser;
}
