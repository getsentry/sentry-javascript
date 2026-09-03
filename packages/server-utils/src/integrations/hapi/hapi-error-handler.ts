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

// Holds the Sentry error-handling state on a server's shared event emitter. Its
// presence means the single Sentry error listener is already attached, so repeat
// attachments only ever register one listener — whether reached via the `start`
// and `initialize` channels, a plugin clone that shares the same emitter, or a
// manual `setupHapiErrorHandler` call.
//
// The `shouldHandleError` predicate lives on this shared object (rather than
// being captured by the listener) so a later attach carrying an explicit
// predicate can upgrade it in place: the integration's configured
// `shouldHandleError` must win even when a default-valued attach (e.g. the
// deprecated `setupHapiErrorHandler`, which precedes `server.start()`) ran first.
const ERROR_HANDLER_STATE = '__SENTRY_HAPI_ERROR_HANDLER_STATE__';

interface HapiErrorHandlerState {
  shouldHandleError: HapiShouldHandleError;
}

type MarkedServerEvents = HapiServerEvents & { [ERROR_HANDLER_STATE]?: HapiErrorHandlerState };

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
 * Idempotent — the emitter carries the handler state, so auto-registration (via
 * the `start` / `initialize` channels) and any explicit `setupHapiErrorHandler`
 * call never stack up multiple listeners.
 *
 * `shouldHandleError` gates which errors are captured (defaults to
 * {@link defaultShouldHandleError}). When omitted, a previously installed
 * predicate is left untouched; when provided, it overrides whatever was set
 * before — so the integration's configured predicate wins over a prior
 * default-valued attach, regardless of ordering.
 */
export function attachHapiErrorHandler(server: HapiServer, shouldHandleError?: HapiShouldHandleError): void {
  const events = server?.events as MarkedServerEvents | undefined;
  if (!events) {
    return;
  }

  const existingState = events[ERROR_HANDLER_STATE];
  if (existingState) {
    // Listener already attached: only an explicit predicate upgrades it, so a
    // later default-valued attach never downgrades a configured one.
    if (shouldHandleError) {
      existingState.shouldHandleError = shouldHandleError;
    }
    return;
  }

  const state: HapiErrorHandlerState = { shouldHandleError: shouldHandleError ?? defaultShouldHandleError };
  addNonEnumerableProperty(events, ERROR_HANDLER_STATE, state);

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

    if (isErrorEvent(event) && state.shouldHandleError(event.error, request)) {
      captureException(event.error, {
        mechanism: {
          type: 'auto.function.hapi',
          handled: false,
        },
      });
    }
  });
}
