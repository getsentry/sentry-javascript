import type { Span, SpanTimeInput, TransactionContext } from '@sentry/types';
import { dropUndefinedKeys, logger, tracingContextFromHeaders } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { getCurrentScope, withScope } from '../exports';
import type { Hub } from '../hub';
import { getCurrentHub } from '../hub';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { spanTimeInputToSeconds } from '../utils/spanUtils';

interface StartSpanOptions extends TransactionContext {
  /** A manually specified start time for the created `Span` object. */
  startTime?: SpanTimeInput;
}

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
 *
 * @deprecated Use `startSpan` instead.
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
  const scope = getCurrentScope();
  const parentSpan = scope.getSpan();

  const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);

  scope.setSpan(activeSpan);

  return handleCallbackErrors(
    () => callback(activeSpan),
    error => {
      activeSpan && activeSpan.setStatus('internal_error');
      onError(error, activeSpan);
    },
    () => {
      activeSpan && activeSpan.end();
      scope.setSpan(parentSpan);
      afterFinish();
    },
  );
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
export function startSpan<T>(context: StartSpanOptions, callback: (span: Span | undefined) => T): T {
  const ctx = normalizeContext(context);

  return withScope(scope => {
    const hub = getCurrentHub();
    const parentSpan = scope.getSpan();

    const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);
    scope.setSpan(activeSpan);

    return handleCallbackErrors(
      () => callback(activeSpan),
      () => {
        // Only update the span status if it hasn't been changed yet
        if (activeSpan && (!activeSpan.status || activeSpan.status === 'ok')) {
          activeSpan.setStatus('internal_error');
        }
      },
      () => activeSpan && activeSpan.end(),
    );
  });
}

/**
 * @deprecated Use {@link startSpan} instead.
 */
export const startActiveSpan = startSpan;

/**
 * Similar to `Sentry.startSpan`. Wraps a function with a transaction/span, but does not finish the span
 * after the function is done automatically. You'll have to call `span.end()` manually.
 *
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startSpanManual<T>(
  context: StartSpanOptions,
  callback: (span: Span | undefined, finish: () => void) => T,
): T {
  const ctx = normalizeContext(context);

  return withScope(scope => {
    const hub = getCurrentHub();
    const parentSpan = scope.getSpan();

    const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);
    scope.setSpan(activeSpan);

    function finishAndSetSpan(): void {
      activeSpan && activeSpan.end();
    }

    return handleCallbackErrors(
      () => callback(activeSpan, finishAndSetSpan),
      () => {
        // Only update the span status if it hasn't been changed yet, and the span is not yet finished
        if (activeSpan && !activeSpan.endTimestamp && (!activeSpan.status || activeSpan.status === 'ok')) {
          activeSpan.setStatus('internal_error');
        }
      },
    );
  });
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
export function startInactiveSpan(context: StartSpanOptions): Span | undefined {
  if (!hasTracingEnabled()) {
    return undefined;
  }

  const ctx = normalizeContext(context);
  const hub = getCurrentHub();
  const parentSpan = getActiveSpan();
  return parentSpan ? parentSpan.startChild(ctx) : hub.startTransaction(ctx);
}

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  return getCurrentScope().getSpan();
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
  const currentScope = getCurrentScope();

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

/**
 * This converts StartSpanOptions to TransactionContext.
 * For the most part (for now) we accept the same options,
 * but some of them need to be transformed.
 *
 * Eventually the StartSpanOptions will be more aligned with OpenTelemetry.
 */
function normalizeContext(context: StartSpanOptions): TransactionContext {
  const ctx = { ...context };
  // If a name is set and a description is not, set the description to the name.
  if (ctx.name !== undefined && ctx.description === undefined) {
    ctx.description = ctx.name;
  }

  if (context.startTime) {
    ctx.startTimestamp = spanTimeInputToSeconds(context.startTime);
    delete ctx.startTime;
  }

  return ctx;
}
