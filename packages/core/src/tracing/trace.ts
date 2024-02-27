import type { Scope, Span, SpanTimeInput, StartSpanOptions, TransactionContext } from '@sentry/types';

import { addNonEnumerableProperty, dropUndefinedKeys, logger, tracingContextFromHeaders } from '@sentry/utils';
import { getDynamicSamplingContextFromSpan } from '.';

import { DEBUG_BUILD } from '../debug-build';
import { getCurrentScope, withScope } from '../exports';
import type { Hub } from '../hub';
import { runWithAsyncContext } from '../hub';
import { getIsolationScope } from '../hub';
import { getCurrentHub } from '../hub';
import type { Scope as ScopeClass } from '../scope';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { spanIsSampled, spanTimeInputToSeconds, spanToJSON } from '../utils/spanUtils';

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

  const spanContext = normalizeContext(context);
  const activeSpan = createChildSpanOrTransaction(hub, {
    parentSpan,
    spanContext,
    forceTransaction: false,
    scope,
  });

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
  const spanContext = normalizeContext(context);

  return runWithAsyncContext(() => {
    return withScope(context.scope, scope => {
      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      const parentSpan = scope.getSpan();

      const shouldSkipSpan = context.onlyIfParent && !parentSpan;
      const activeSpan = shouldSkipSpan
        ? undefined
        : createChildSpanOrTransaction(hub, {
            parentSpan,
            spanContext,
            forceTransaction: context.forceTransaction,
            scope,
          });

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
  const spanContext = normalizeContext(context);

  return runWithAsyncContext(() => {
    return withScope(context.scope, scope => {
      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      const parentSpan = scope.getSpan();

      const shouldSkipSpan = context.onlyIfParent && !parentSpan;
      const activeSpan = shouldSkipSpan
        ? undefined
        : createChildSpanOrTransaction(hub, {
            parentSpan,
            spanContext,
            forceTransaction: context.forceTransaction,
            scope,
          });

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

  const spanContext = normalizeContext(context);
  // eslint-disable-next-line deprecation/deprecation
  const hub = getCurrentHub();
  const parentSpan = context.scope
    ? // eslint-disable-next-line deprecation/deprecation
      context.scope.getSpan()
    : getActiveSpan();

  const shouldSkipSpan = context.onlyIfParent && !parentSpan;

  if (shouldSkipSpan) {
    return undefined;
  }

  const scope = context.scope || getCurrentScope();

  // Even though we don't actually want to make this span active on the current scope,
  // we need to make it active on a temporary scope that we use for event processing
  // as otherwise, it won't pick the correct span for the event when processing it
  const temporaryScope = (scope as ScopeClass).clone();

  return createChildSpanOrTransaction(hub, {
    parentSpan,
    spanContext,
    forceTransaction: context.forceTransaction,
    scope: temporaryScope,
  });
}

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentScope().getSpan();
}

interface ContinueTrace {
  /**
   * Continue a trace from `sentry-trace` and `baggage` values.
   * These values can be obtained from incoming request headers,
   * or in the browser from `<meta name="sentry-trace">` and `<meta name="baggage">` HTML tags.
   *
   * @deprecated Use the version of this function taking a callback as second parameter instead:
   *
   * ```
   * Sentry.continueTrace(sentryTrace: '...', baggage: '...' }, () => {
   *    // ...
   * })
   * ```
   *
   */
  ({
    sentryTrace,
    baggage,
  }: {
    // eslint-disable-next-line deprecation/deprecation
    sentryTrace: Parameters<typeof tracingContextFromHeaders>[0];
    // eslint-disable-next-line deprecation/deprecation
    baggage: Parameters<typeof tracingContextFromHeaders>[1];
  }): Partial<TransactionContext>;

  /**
   * Continue a trace from `sentry-trace` and `baggage` values.
   * These values can be obtained from incoming request headers, or in the browser from `<meta name="sentry-trace">`
   * and `<meta name="baggage">` HTML tags.
   *
   * Spans started with `startSpan`, `startSpanManual` and `startInactiveSpan`, within the callback will automatically
   * be attached to the incoming trace.
   *
   * Deprecation notice: In the next major version of the SDK the provided callback will not receive a transaction
   * context argument.
   */
  <V>(
    {
      sentryTrace,
      baggage,
    }: {
      // eslint-disable-next-line deprecation/deprecation
      sentryTrace: Parameters<typeof tracingContextFromHeaders>[0];
      // eslint-disable-next-line deprecation/deprecation
      baggage: Parameters<typeof tracingContextFromHeaders>[1];
    },
    // TODO(v8): Remove parameter from this callback.
    callback: (transactionContext: Partial<TransactionContext>) => V,
  ): V;
}

export const continueTrace: ContinueTrace = <V>(
  {
    sentryTrace,
    baggage,
  }: {
    // eslint-disable-next-line deprecation/deprecation
    sentryTrace: Parameters<typeof tracingContextFromHeaders>[0];
    // eslint-disable-next-line deprecation/deprecation
    baggage: Parameters<typeof tracingContextFromHeaders>[1];
  },
  callback?: (transactionContext: Partial<TransactionContext>) => V,
): V | Partial<TransactionContext> => {
  // TODO(v8): Change this function so it doesn't do anything besides setting the propagation context on the current scope:
  /*
    return withScope((scope) => {
      const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
      scope.setPropagationContext(propagationContext);
      return callback();
    })
  */

  const currentScope = getCurrentScope();

  // eslint-disable-next-line deprecation/deprecation
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

  return runWithAsyncContext(() => {
    return callback(transactionContext);
  });
};

function createChildSpanOrTransaction(
  hub: Hub,
  {
    parentSpan,
    spanContext,
    forceTransaction,
    scope,
  }: {
    parentSpan: Span | undefined;
    spanContext: TransactionContext;
    forceTransaction?: boolean;
    scope: Scope;
  },
): Span | undefined {
  if (!hasTracingEnabled()) {
    return undefined;
  }

  const isolationScope = getIsolationScope();

  let span: Span | undefined;
  if (parentSpan && !forceTransaction) {
    // eslint-disable-next-line deprecation/deprecation
    span = parentSpan.startChild(spanContext);
  } else if (parentSpan) {
    // If we forced a transaction but have a parent span, make sure to continue from the parent span, not the scope
    const dsc = getDynamicSamplingContextFromSpan(parentSpan);
    const { traceId, spanId: parentSpanId } = parentSpan.spanContext();
    const sampled = spanIsSampled(parentSpan);

    // eslint-disable-next-line deprecation/deprecation
    span = hub.startTransaction({
      traceId,
      parentSpanId,
      parentSampled: sampled,
      ...spanContext,
      metadata: {
        dynamicSamplingContext: dsc,
        // eslint-disable-next-line deprecation/deprecation
        ...spanContext.metadata,
      },
    });
  } else {
    const { traceId, dsc, parentSpanId, sampled } = {
      ...isolationScope.getPropagationContext(),
      ...scope.getPropagationContext(),
    };

    // eslint-disable-next-line deprecation/deprecation
    span = hub.startTransaction({
      traceId,
      parentSpanId,
      parentSampled: sampled,
      ...spanContext,
      metadata: {
        dynamicSamplingContext: dsc,
        // eslint-disable-next-line deprecation/deprecation
        ...spanContext.metadata,
      },
    });
  }

  // We always set this as active span on the scope
  // In the case of this being an inactive span, we ensure to pass a detached scope in here in the first place
  // But by having this here, we can ensure that the lookup through `getCapturedScopesOnSpan` results in the correct scope & span combo
  // eslint-disable-next-line deprecation/deprecation
  scope.setSpan(span);

  setCapturedScopesOnSpan(span, scope, isolationScope);

  return span;
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

const SCOPE_ON_START_SPAN_FIELD = '_sentryScope';
const ISOLATION_SCOPE_ON_START_SPAN_FIELD = '_sentryIsolationScope';

type SpanWithScopes = Span & {
  [SCOPE_ON_START_SPAN_FIELD]?: Scope;
  [ISOLATION_SCOPE_ON_START_SPAN_FIELD]?: Scope;
};

function setCapturedScopesOnSpan(span: Span | undefined, scope: Scope, isolationScope: Scope): void {
  if (span) {
    addNonEnumerableProperty(span, ISOLATION_SCOPE_ON_START_SPAN_FIELD, isolationScope);
    addNonEnumerableProperty(span, SCOPE_ON_START_SPAN_FIELD, scope);
  }
}

/**
 * Grabs the scope and isolation scope off a span that were active when the span was started.
 */
export function getCapturedScopesOnSpan(span: Span): { scope?: Scope; isolationScope?: Scope } {
  return {
    scope: (span as SpanWithScopes)[SCOPE_ON_START_SPAN_FIELD],
    isolationScope: (span as SpanWithScopes)[ISOLATION_SCOPE_ON_START_SPAN_FIELD],
  };
}
