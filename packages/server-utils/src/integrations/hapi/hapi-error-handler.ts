import {
  addNonEnumerableProperty,
  captureException,
  debug,
  getDefaultIsolationScope,
  getIsolationScope,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { HapiRequest, HapiRequestEvent, HapiServer, HapiServerEvents, HapiShouldHandleError } from './hapi-types';
import { defaultShouldHandleError } from './hapi-utils';

// Marks a server's shared event emitter as already carrying the Sentry error
// listener, so repeat attachments only ever register a single listener — whether
// reached via the `start` and `initialize` channels, a plugin clone that shares
// the same emitter, or a lingering manual `setupHapiErrorHandler` call.
const ERROR_HANDLER_ATTACHED = '__SENTRY_HAPI_ERROR_HANDLER_ATTACHED__';

type MarkedServerEvents = HapiServerEvents & { [ERROR_HANDLER_ATTACHED]?: boolean };

function isErrorEvent(event: HapiRequestEvent): boolean {
  return !!(event && typeof event === 'object' && 'error' in event && event.error);
}

/**
 * Attach a Sentry error listener to a Hapi server's shared event emitter.
 *
 * The listener sets the isolation scope's transaction name from the errored
 * route and captures the error. It is attached once per server: hapi shares one
 * event emitter (`core.events`) across the root server and every plugin clone,
 * so a single listener covers all requests.
 *
 * Idempotent — the emitter is marked so auto-registration (via the `start` /
 * `initialize` channels) and any explicit `setupHapiErrorHandler` call never
 * stack up multiple listeners.
 *
 * `shouldHandleError` gates which errors are captured (defaults to
 * {@link defaultShouldHandleError}); the integration threads its option through
 * here, while the deprecated `setupHapiErrorHandler` relies on the default.
 */
export function attachHapiErrorHandler(
  server: HapiServer,
  shouldHandleError: HapiShouldHandleError = defaultShouldHandleError,
): void {
  const events = server?.events as MarkedServerEvents | undefined;
  if (!events || events[ERROR_HANDLER_ATTACHED]) {
    return;
  }
  addNonEnumerableProperty(events, ERROR_HANDLER_ATTACHED, true);

  events.on({ name: 'request', channels: ['error'] }, (request: HapiRequest, event: HapiRequestEvent) => {
    if (getIsolationScope() !== getDefaultIsolationScope()) {
      const route = request.route;
      if (route?.path) {
        getIsolationScope().setTransactionName(`${route.method.toUpperCase()} ${route.path}`);
      }
    } else {
      DEBUG_BUILD &&
        debug.warn('Isolation scope is still the default isolation scope - skipping setting transactionName');
    }

    if (isErrorEvent(event) && shouldHandleError(event.error, request)) {
      captureException(event.error, {
        mechanism: {
          type: 'auto.function.hapi',
          handled: false,
        },
      });
    }
  });
}
