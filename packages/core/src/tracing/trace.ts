import type { TransactionContext } from '@sentry/types';
import { dropUndefinedKeys, isThenable, logger, tracingContextFromHeaders } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { Hub } from '../hub';
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
  onError: (error: unknown, span?: Span) => void = () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  afterFinish: () => void = () => {},
): T {
  const ctx = normalizeContext(context);

  const hub = getCurrentHub();
  const scope = hub.getScope();
  const parentSpan = scope.getSpan();

  const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);

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
    onError(e, activeSpan);
    finishAndSetSpan();
    afterFinish();
    throw e;
  }

  if (isThenable(maybePromiseResult)) {
    Promise.resolve(maybePromiseResult).then(
      () => {
        finishAndSetSpan();
        afterFinish();
      },
      e => {
        activeSpan && activeSpan.setStatus('internal_error');
        onError(e, activeSpan);
        finishAndSetSpan();
        afterFinish();
      },
    );
  } else {
    finishAndSetSpan();
    afterFinish();
  }

  return maybePromiseResult;
}

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getSpan()`, as long as the function is executed while the scope is active.
 *
 * If you want to create a span that is not set as active, use {@link startInactiveSpan}.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startSpan<T>(context: TransactionContext, callback: (span: Span | undefined) => T): T {
  const ctx = normalizeContext(context);

  const hub = getCurrentHub();
  const scope = hub.getScope();
  const parentSpan = scope.getSpan();

  const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);
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
 * @deprecated Use {@link startSpan} instead.
 */
export const startActiveSpan = startSpan;

/**
 * Similar to `Sentry.startSpan`. Wraps a function with a transaction/span, but does not finish the span
 * after the function is done automatically.
 *
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startSpanManual<T>(
  context: TransactionContext,
  callback: (span: Span | undefined, finish: () => void) => T,
): T {
  const ctx = normalizeContext(context);

  const hub = getCurrentHub();
  const scope = hub.getScope();
  const parentSpan = scope.getSpan();

  const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);
  scope.setSpan(activeSpan);

  function finishAndSetSpan(): void {
    activeSpan && activeSpan.finish();
    hub.getScope().setSpan(parentSpan);
  }

  let maybePromiseResult: T;
  try {
    maybePromiseResult = callback(activeSpan, finishAndSetSpan);
  } catch (e) {
    activeSpan && activeSpan.setStatus('internal_error');
    throw e;
  }

  if (isThenable(maybePromiseResult)) {
    Promise.resolve(maybePromiseResult).then(undefined, () => {
      activeSpan && activeSpan.setStatus('internal_error');
    });
  }

  return maybePromiseResult;
}

/**
 * Creates a span. This span is not set as active, so will not get automatic instrumentation spans
 * as children or be able to be accessed via `Sentry.getSpan()`.
 *
 * If you want to create a span that is set as active, use {@link startSpan}.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate` or `tracesSampler`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startInactiveSpan(context: TransactionContext): Span | undefined {
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

export function continueTrace({
  sentryTrace,
  baggage,
}: {
  sentryTrace: Parameters<typeof tracingContextFromHeaders>[0];
  baggage: Parameters<typeof tracingContextFromHeaders>[1];
}): Partial<TransactionContext>;
export function continueTrace<V>(
  {
    sentryTrace,
    baggage,
  }: {
    sentryTrace: Parameters<typeof tracingContextFromHeaders>[0];
    baggage: Parameters<typeof tracingContextFromHeaders>[1];
  },
  callback: (transactionContext: Partial<TransactionContext>) => V,
): V;
/**
 * Continue a trace from `sentry-trace` and `baggage` values.
 * These values can be obtained from incoming request headers,
 * or in the browser from `<meta name="sentry-trace">` and `<meta name="baggage">` HTML tags.
 *
 * The callback receives a transactionContext that may be used for `startTransaction` or `startSpan`.
 */
export function continueTrace<V>(
  {
    sentryTrace,
    baggage,
  }: {
    sentryTrace: Parameters<typeof tracingContextFromHeaders>[0];
    baggage: Parameters<typeof tracingContextFromHeaders>[1];
  },
  callback?: (transactionContext: Partial<TransactionContext>) => V,
): V | Partial<TransactionContext> {
  const hub = getCurrentHub();
  const currentScope = hub.getScope();

  const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
    sentryTrace,
    baggage,
  );

  currentScope.setPropagationContext(propagationContext);

  if (DEBUG_BUILD && traceparentData) {
    logger.log(`[Tracing] Continuing trace ${traceparentData.traceId}.`);
  }

  const transactionContext: Partial<TransactionContext> = {
    ...traceparentData,
    metadata: dropUndefinedKeys({
      dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
    }),
  };

  if (!callback) {
    return transactionContext;
  }

  return callback(transactionContext);
}

function createChildSpanOrTransaction(
  hub: Hub,
  parentSpan: Span | undefined,
  ctx: TransactionContext,
): Span | undefined {
  if (!hasTracingEnabled()) {
    return undefined;
  }
  return parentSpan ? parentSpan.startChild(ctx) : hub.startTransaction(ctx);
}

function normalizeContext(context: TransactionContext): TransactionContext {
  const ctx = { ...context };
  // If a name is set and a description is not, set the description to the name.
  if (ctx.name !== undefined && ctx.description === undefined) {
    ctx.description = ctx.name;
  }

  return ctx;
}
