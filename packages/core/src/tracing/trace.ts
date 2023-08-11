import type { TransactionContext } from '@sentry/types';
import { isThenable } from '@sentry/utils';

import { getCurrentHub } from '../hub';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import type { Span } from './span';

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 *
 * This function is meant to be used internally and may break at any time. Use at your own risk.
 *
 * @internal
 * @private
 */
export function trace<T>(
  context: TransactionContext,
  callback: (span?: Span) => T,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onError: (error: unknown) => void = () => {},
): T {
  const ctx = { ...context };
  // If a name is set and a description is not, set the description to the name.
  if (ctx.name !== undefined && ctx.description === undefined) {
    ctx.description = ctx.name;
  }

  const hub = getCurrentHub();
  const scope = hub.getScope();

  const parentSpan = scope.getSpan();

  function getActiveSpan(): Span | undefined {
    if (!hasTracingEnabled()) {
      return undefined;
    }
    return parentSpan ? parentSpan.startChild(ctx) : hub.startTransaction(ctx);
  }

  const activeSpan = getActiveSpan();
  scope.setSpan(activeSpan);

  function finishAndSetSpan(): void {
    activeSpan && activeSpan.finish();
    hub.getScope().setSpan(parentSpan);
  }

  let maybePromiseResult: T;
  try {
    maybePromiseResult = callback(activeSpan);
  } catch (e) {
    activeSpan && activeSpan.setStatus('internal_error');
    onError(e);
    finishAndSetSpan();
    throw e;
  }

  if (isThenable(maybePromiseResult)) {
    Promise.resolve(maybePromiseResult).then(
      () => {
        finishAndSetSpan();
      },
      e => {
        activeSpan && activeSpan.setStatus('internal_error');
        onError(e);
        finishAndSetSpan();
      },
    );
  } else {
    finishAndSetSpan();
  }

  return maybePromiseResult;
}

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getSpan()`, as long as the function is executed while the scope is active.
 *
 * If you want to create a span that is not set as active, use {@link startSpan}.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startActiveSpan<T>(context: TransactionContext, callback: (span: Span | undefined) => T): T {
  const ctx = { ...context };
  // If a name is set and a description is not, set the description to the name.
  if (ctx.name !== undefined && ctx.description === undefined) {
    ctx.description = ctx.name;
  }

  const hub = getCurrentHub();
  const scope = hub.getScope();

  const parentSpan = scope.getSpan();

  function getActiveSpan(): Span | undefined {
    if (!hasTracingEnabled()) {
      return undefined;
    }
    return parentSpan ? parentSpan.startChild(ctx) : hub.startTransaction(ctx);
  }

  const activeSpan = getActiveSpan();
  scope.setSpan(activeSpan);

  function finishAndSetSpan(): void {
    activeSpan && activeSpan.finish();
    hub.getScope().setSpan(parentSpan);
  }

  let maybePromiseResult: T;
  try {
    maybePromiseResult = callback(activeSpan);
  } catch (e) {
    activeSpan && activeSpan.setStatus('internal_error');
    finishAndSetSpan();
    throw e;
  }

  if (isThenable(maybePromiseResult)) {
    Promise.resolve(maybePromiseResult).then(
      () => {
        finishAndSetSpan();
      },
      () => {
        activeSpan && activeSpan.setStatus('internal_error');
        finishAndSetSpan();
      },
    );
  } else {
    finishAndSetSpan();
  }

  return maybePromiseResult;
}

/**
 * Creates a span. This span is not set as active, so will not get automatic instrumentation spans
 * as children or be able to be accessed via `Sentry.getSpan()`.
 *
 * If you want to create a span that is set as active, use {@link startActiveSpan}.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate` or `tracesSampler`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startSpan(context: TransactionContext): Span | undefined {
  if (!hasTracingEnabled()) {
    return undefined;
  }

  const ctx = { ...context };
  // If a name is set and a description is not, set the description to the name.
  if (ctx.name !== undefined && ctx.description === undefined) {
    ctx.description = ctx.name;
  }

  const hub = getCurrentHub();
  const parentSpan = getActiveSpan();
  return parentSpan ? parentSpan.startChild(ctx) : hub.startTransaction(ctx);
}

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  return getCurrentHub().getScope().getSpan();
}
