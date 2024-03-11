import type { ServerRuntimeClient } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { captureEvent } from '@sentry/core';
import { getClient } from '@sentry/core';
import { flush } from '@sentry/core';
import type { Client, Event, IntegrationFn, Primitive, StackParser } from '@sentry/types';
import { eventFromUnknownInput, isPrimitive } from '@sentry/utils';

type GlobalHandlersIntegrationsOptionKeys = 'error' | 'unhandledrejection';

type GlobalHandlersIntegrations = Record<GlobalHandlersIntegrationsOptionKeys, boolean>;

const INTEGRATION_NAME = 'GlobalHandlers';
let isExiting = false;

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

    const stackParser = getStackParser();

    const { message, error } = data;

    const event = eventFromUnknownInput(client, stackParser, error || message);

    event.level = 'fatal';

    captureEvent(event, {
      originalException: error,
      mechanism: {
        handled: false,
        type: 'error',
      },
    });

    // Stop the app from exiting for now
    data.preventDefault();
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
  });
}

function installGlobalUnhandledRejectionHandler(client: Client): void {
  globalThis.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (getClient() !== client || isExiting) {
      return;
    }

    const stackParser = getStackParser();
    let error = e;

    // dig the object of the rejection out of known event types
    try {
      if ('reason' in e) {
        error = e.reason;
      }
    } catch (_oO) {
      // no-empty
    }

    const event = isPrimitive(error)
      ? eventFromRejectionWithPrimitive(error)
      : eventFromUnknownInput(client, stackParser, error, undefined);

    event.level = 'fatal';

    captureEvent(event, {
      originalException: error,
      mechanism: {
        handled: false,
        type: 'unhandledrejection',
      },
    });

    // Stop the app from exiting for now
    e.preventDefault();
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
