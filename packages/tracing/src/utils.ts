import { getCurrentHub, Hub } from '@sentry/hub';
import { Options, Scope, SpanContext, Transaction } from '@sentry/types';
import { isThenable } from '@sentry/utils';

import { Span } from './span';

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

interface TraceOptions {
  captureError?: boolean;
  hub?: Hub;
}

/** Traces a callback */
export function trace<T>(
  ctx: SpanContext,
  callback: (scope?: Scope) => T,
  { captureError = false, hub = getCurrentHub() }: TraceOptions = {},
): T {
  const scope = hub.getScope();
  const parentSpan = scope?.getSpan();

  const span = parentSpan?.startChild(ctx);
  scope?.setSpan(span);

  function finishSpan(finishedSpan?: Span, isError: boolean = false): void {
    if (!finishedSpan) {
      return;
    }
    const transaction = getActiveTransaction();
    if (isError) {
      finishedSpan.setStatus('internal_error');
    }
    finishedSpan.finish();
    // if the parent span is already finished, put the transaction on the scope
    if (parentSpan?.endTimestamp) {
      scope?.setSpan(transaction);
    } else {
      scope?.setSpan(parentSpan);
    }
  }

  try {
    const rv = callback(scope);

    if (isThenable(rv)) {
      return rv.then(
        r => {
          finishSpan(span);
          return r;
        },
        e => {
          finishSpan(span, true);
          throw e;
        },
      ) as unknown as T;
    }

    finishSpan(span);
    return rv;
  } catch (e) {
    finishSpan(span, true);
    if (captureError) {
      hub.captureException(e);
    }
    throw e;
  }
}

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
