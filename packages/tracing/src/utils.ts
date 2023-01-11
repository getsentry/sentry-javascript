import type { Hub } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import type { Options, Transaction } from '@sentry/types';

/**
 * The `extractTraceparentData` function and `TRACEPARENT_REGEXP` constant used
 * to be declared in this file. It was later moved into `@sentry/utils` as part of a
 * move to remove `@sentry/tracing` dependencies from `@sentry/node` (`extractTraceparentData`
 * is the only tracing function used by `@sentry/node`).
 *
 * These exports are kept here for backwards compatability's sake.
 *
 * TODO(v7): Reorganize these exports
 *
 * See https://github.com/getsentry/sentry-javascript/issues/4642 for more details.
 */
export { TRACEPARENT_REGEXP, extractTraceparentData } from '@sentry/utils';

/**
 * Determines if tracing is currently enabled.
 *
 * Tracing is enabled when at least one of `tracesSampleRate` and `tracesSampler` is defined in the SDK config.
 */
export function hasTracingEnabled(
  maybeOptions?: Pick<Options, 'tracesSampleRate' | 'tracesSampler'> | undefined,
): boolean {
  const client = getCurrentHub().getClient();
  const options = maybeOptions || (client && client.getOptions());
  return !!options && ('tracesSampleRate' in options || 'tracesSampler' in options);
}

/** Grabs active transaction off scope, if any */
export function getActiveTransaction<T extends Transaction>(maybeHub?: Hub): T | undefined {
  const hub = maybeHub || getCurrentHub();
  const scope = hub.getScope();
  return scope && (scope.getTransaction() as T | undefined);
}

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
export function msToSec(time: number): number {
  return time / 1000;
}

/**
 * Converts from seconds to milliseconds
 * @param time time in seconds
 */
export function secToMs(time: number): number {
  return time * 1000;
}

// so it can be used in manual instrumentation without necessitating a hard dependency on @sentry/utils
export { stripUrlQueryAndFragment } from '@sentry/utils';
