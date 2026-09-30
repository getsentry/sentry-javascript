import * as diagnosticsChannel from 'node:diagnostics_channel';
import { createMultiMatcher } from 'remix/route-pattern/match';
import { remixV3Channels } from '@sentry/server-utils/orchestrion/config';

import type { MatcherLike, RequestListenerOptionsLike, RouterOptionsLike } from '../types';
import { captureRequestError } from './errorFilter';
import { sentryRemixMiddleware } from './middleware';

const NOOP = (): void => {};

/** The call's arguments, as orchestrion's transform attaches them to a tracing channel context. */
interface ChannelContext {
  arguments: unknown[];
}

// Marks an options object already injected into, so the same mutation cannot be applied twice.
const INJECTED = Symbol.for('SentryRemixV3Injected');

// `subscribe()` takes a fresh object literal and the channel keys handlers by identity, so nothing else
// stops a second call adding a second set. The documented setup calls this twice, from the `--import`
// entry and from `setupOnce()`.
let subscribed = false;

/**
 * Prepend the Sentry middleware to every router an app builds.
 *
 * Injection happens on the channel's `start` event, before `createRouter` reads its options.
 * Orchestrion's transform collects the arguments into an array and spreads them back into the call, so
 * assigning at an index the caller never passed works. That is what covers `createRouter()` with no
 * arguments at all.
 */
export function instrumentRemixV3(): void {
  if (subscribed || !diagnosticsChannel.tracingChannel) {
    return;
  }
  subscribed = true;

  subscribeToCreateRouter();
  subscribeToCreateRequestListener();
}

function subscribeToCreateRouter(): void {
  diagnosticsChannel.tracingChannel<ChannelContext, ChannelContext>(remixV3Channels.REMIX_V3_CREATE_ROUTER).subscribe({
    start(data) {
      // Node rethrows anything this handler throws as an uncaught exception, which would kill an app
      // that runs fine without Sentry. Frozen options, a non-writable property and a `route-pattern`
      // copy that cannot build a matcher all reach here, so the router is left uninstrumented instead.
      try {
        injectRouterMiddleware(ensureOptions(data.arguments));
      } catch {
        // Ignored on purpose.
      }
    },
    end: NOOP,
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}

/**
 * Report errors from any fetch handler, router or not. The middleware only sees failures inside a
 * router; this is the only hook that covers a plain handler. No abort guard is needed, because the
 * listener drops aborted requests before calling `onError`.
 */
function subscribeToCreateRequestListener(): void {
  diagnosticsChannel
    .tracingChannel<ChannelContext, ChannelContext>(remixV3Channels.REMIX_V3_CREATE_REQUEST_LISTENER)
    .subscribe({
      start(data) {
        try {
          injectOnError(ensureOptions(data.arguments, 1));
        } catch {
          // Ignored on purpose.
        }
      },
      end: NOOP,
      asyncStart: NOOP,
      asyncEnd: NOOP,
      error: NOOP,
    });
}

function injectOnError(raw: Record<string, unknown> | undefined): void {
  if (!raw || markInjected(raw)) {
    return;
  }

  const options = raw as RequestListenerOptionsLike;
  const appOnError = options.onError;

  options.onError = error => {
    captureRequestError(error, undefined, 'auto.http.remix_v3.on_error');

    // Chained so the app keeps its own response.
    return appOnError?.(error);
  };
}

/**
 * The options object, created when the caller omitted it. `undefined` when the caller passed something
 * that is not an options object, which must not be overwritten.
 */
function ensureOptions(args: unknown[], index = 0): Record<string, unknown> | undefined {
  const existing = args[index];

  if (existing === undefined || existing === null) {
    const created: Record<string, unknown> = {};
    args[index] = created;
    return created;
  }

  return typeof existing === 'object' ? (existing as Record<string, unknown>) : undefined;
}

/** Whether this object was already injected into, marking it when it was not. */
function markInjected(raw: Record<string, unknown>): boolean {
  const marker = raw as { [INJECTED]?: boolean };
  if (marker[INJECTED]) {
    return true;
  }
  marker[INJECTED] = true;
  return false;
}

function injectRouterMiddleware(raw: Record<string, unknown> | undefined): void {
  if (!raw || markInjected(raw)) {
    return;
  }

  const options = raw as RouterOptionsLike;

  // The router never exposes its matcher, and resolving the route pattern needs one, so supplying it is
  // the only way to hold a reference. An app that supplied its own keeps it.
  const matcher: MatcherLike = options.matcher ?? (createMultiMatcher() as MatcherLike);
  options.matcher = matcher;

  // Prepended rather than appended, so the Sentry middleware wraps the app's own.
  options.middleware = [sentryRemixMiddleware(matcher), ...(options.middleware ?? [])];
}
