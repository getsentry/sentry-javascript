import type {
  Instrumenter,
  Primitive,
  Scope,
  Span,
  SpanTimeInput,
  TransactionContext,
  TransactionMetadata,
} from '@sentry/types';
import type { SpanAttributes } from '@sentry/types';
import type { SpanOrigin } from '@sentry/types';
import type { TransactionSource } from '@sentry/types';
import { dropUndefinedKeys, logger, tracingContextFromHeaders } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { getCurrentScope, withScope } from '../exports';
import type { Hub } from '../hub';
import { getCurrentHub } from '../hub';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { spanTimeInputToSeconds, spanToJSON } from '../utils/spanUtils';

interface StartSpanOptions extends TransactionContext {
  /** A manually specified start time for the created `Span` object. */
  startTime?: SpanTimeInput;

  /** If defined, start this span off this scope instead off the current scope. */
  scope?: Scope;

  /** The name of the span. */
  name: string;

  /** An op for the span. This is a categorization for spans. */
  op?: string;

  /** The origin of the span - if it comes from auto instrumenation or manual instrumentation. */
  origin?: SpanOrigin;

  /** Attributes for the span. */
  attributes?: SpanAttributes;

  // All remaining fields are deprecated

  /**
   * @deprecated Manually set the end timestamp instead.
   */
  trimEnd?: boolean;

  /**
   * @deprecated This cannot be set manually anymore.
   */
  parentSampled?: boolean;

  /**
   * @deprecated Use attributes or set data on scopes instead.
   */
  metadata?: Partial<TransactionMetadata>;

  /**
   * The name thingy.
   * @deprecated Use `name` instead.
   */
  description?: string;

  /**
   * @deprecated Use `span.setStatus()` instead.
   */
  status?: string;

  /**
   * @deprecated Use `scope` instead.
   */
  parentSpanId?: string;

  /**
   * @deprecated You cannot manually set the span to sampled anymore.
   */
  sampled?: boolean;

  /**
   * @deprecated You cannot manually set the spanId anymore.
   */
  spanId?: string;

  /**
   * @deprecated You cannot manually set the traceId anymore.
   */
  traceId?: string;

  /**
   * @deprecated Use an attribute instead.
   */
  source?: TransactionSource;

  /**
   * @deprecated Use attributes or set tags on the scope instead.
   */
  tags?: { [key: string]: Primitive };

  /**
   * @deprecated Use attributes instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: { [key: string]: any };

  /**
   * @deprecated Use `startTime` instead.
   */
  startTimestamp?: number;

  /**
   * @deprecated Use `span.end()` instead.
   */
  endTimestamp?: number;

  /**
   * @deprecated You cannot set the instrumenter manually anymore.
   */
  instrumenter?: Instrumenter;
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
  // eslint-disable-next-line deprecation/deprecation
  const hub = getCurrentHub();
  const scope = getCurrentScope();
  // eslint-disable-next-line deprecation/deprecation
  const parentSpan = scope.getSpan();

  const ctx = normalizeContext(context);
  const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);

  // eslint-disable-next-line deprecation/deprecation
  scope.setSpan(activeSpan);

  return handleCallbackErrors(
    () => callback(activeSpan),
    error => {
      activeSpan && activeSpan.setStatus('internal_error');
      onError(error, activeSpan);
    },
    () => {
      activeSpan && activeSpan.end();
      // eslint-disable-next-line deprecation/deprecation
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

  return withScope(context.scope, scope => {
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    // eslint-disable-next-line deprecation/deprecation
    const parentSpan = scope.getSpan();

    const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);
    // eslint-disable-next-line deprecation/deprecation
    scope.setSpan(activeSpan);

    return handleCallbackErrors(
      () => callback(activeSpan),
      () => {
        // Only update the span status if it hasn't been changed yet
        if (activeSpan) {
          const { status } = spanToJSON(activeSpan);
          if (!status || status === 'ok') {
            activeSpan.setStatus('internal_error');
          }
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

  return withScope(context.scope, scope => {
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    // eslint-disable-next-line deprecation/deprecation
    const parentSpan = scope.getSpan();

    const activeSpan = createChildSpanOrTransaction(hub, parentSpan, ctx);
    // eslint-disable-next-line deprecation/deprecation
    scope.setSpan(activeSpan);

    function finishAndSetSpan(): void {
      activeSpan && activeSpan.end();
    }

    return handleCallbackErrors(
      () => callback(activeSpan, finishAndSetSpan),
      () => {
        // Only update the span status if it hasn't been changed yet, and the span is not yet finished
        if (activeSpan && activeSpan.isRecording()) {
          const { status } = spanToJSON(activeSpan);
          if (!status || status === 'ok') {
            activeSpan.setStatus('internal_error');
          }
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
  // eslint-disable-next-line deprecation/deprecation
  const hub = getCurrentHub();
  const parentSpan = context.scope
    ? // eslint-disable-next-line deprecation/deprecation
      context.scope.getSpan()
    : getActiveSpan();
  return parentSpan
    ? // eslint-disable-next-line deprecation/deprecation
      parentSpan.startChild(ctx)
    : // eslint-disable-next-line deprecation/deprecation
      hub.startTransaction(ctx);
}

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  // eslint-disable-next-line deprecation/deprecation
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
      dynamicSamplingContext,
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
  return parentSpan
    ? // eslint-disable-next-line deprecation/deprecation
      parentSpan.startChild(ctx)
    : // eslint-disable-next-line deprecation/deprecation
      hub.startTransaction(ctx);
}

/**
 * This converts StartSpanOptions to TransactionContext.
 * For the most part (for now) we accept the same options,
 * but some of them need to be transformed.
 *
 * Eventually the StartSpanOptions will be more aligned with OpenTelemetry.
 */
function normalizeContext(context: StartSpanOptions): TransactionContext {
  if (context.startTime) {
    const ctx: TransactionContext & { startTime?: SpanTimeInput } = { ...context };
    ctx.startTimestamp = spanTimeInputToSeconds(context.startTime);
    delete ctx.startTime;
    return ctx;
  }

  return context;
}
