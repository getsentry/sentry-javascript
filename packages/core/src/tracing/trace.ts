import type { Scope, Span, SpanTimeInput, StartSpanOptions, TransactionContext } from '@sentry/types';

import { addNonEnumerableProperty, propagationContextFromHeaders } from '@sentry/utils';

import { getCurrentScope, withScope } from '../exports';
import type { Hub } from '../hub';
import { runWithAsyncContext } from '../hub';
import { getIsolationScope } from '../hub';
import { getCurrentHub } from '../hub';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { spanTimeInputToSeconds, spanToJSON } from '../utils/spanUtils';

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

  return runWithAsyncContext(() => {
    return withScope(context.scope, scope => {
      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      const parentSpan = scope.getSpan();

      const shouldSkipSpan = context.onlyIfParent && !parentSpan;
      const activeSpan = shouldSkipSpan ? undefined : createChildSpanOrTransaction(hub, parentSpan, ctx);

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

  return runWithAsyncContext(() => {
    return withScope(context.scope, scope => {
      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      const parentSpan = scope.getSpan();

      const shouldSkipSpan = context.onlyIfParent && !parentSpan;
      const activeSpan = shouldSkipSpan ? undefined : createChildSpanOrTransaction(hub, parentSpan, ctx);

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

  const shouldSkipSpan = context.onlyIfParent && !parentSpan;

  if (shouldSkipSpan) {
    return undefined;
  }

  const isolationScope = getIsolationScope();
  const scope = getCurrentScope();

  let span: Span | undefined;

  if (parentSpan) {
    // eslint-disable-next-line deprecation/deprecation
    span = parentSpan.startChild(ctx);
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
      ...ctx,
      metadata: {
        dynamicSamplingContext: dsc,
        // eslint-disable-next-line deprecation/deprecation
        ...ctx.metadata,
      },
    });
  }

  setCapturedScopesOnSpan(span, scope, isolationScope);

  return span;
}

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentScope().getSpan();
}

/**
 * Continue a trace from `sentry-trace` and `baggage` values.
 * These values can be obtained from incoming request headers, or in the browser from `<meta name="sentry-trace">`
 * and `<meta name="baggage">` HTML tags.
 *
 * Spans started with `startSpan`, `startSpanManual` and `startInactiveSpan`, within the callback will automatically
 * be attached to the incoming trace.
 */
export function continueTrace<V>(
  {
    sentryTrace,
    baggage,
  }: {
    sentryTrace: Parameters<typeof propagationContextFromHeaders>[0];
    baggage: Parameters<typeof propagationContextFromHeaders>[1];
  },
  callback: () => V,
): V {
  // TODO(v8): Remove this runWithAsyncContext call in case we call it in withScope by the time we've finished migrating all of the functionality.
  return runWithAsyncContext(() => {
    return withScope(scope => {
      const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
      scope.setPropagationContext(propagationContext);
      return callback();
    });
  });
}

function createChildSpanOrTransaction(
  hub: Hub,
  parentSpan: Span | undefined,
  ctx: TransactionContext,
): Span | undefined {
  if (!hasTracingEnabled()) {
    return undefined;
  }

  const isolationScope = getIsolationScope();
  const scope = getCurrentScope();

  let span: Span | undefined;
  if (parentSpan) {
    // eslint-disable-next-line deprecation/deprecation
    span = parentSpan.startChild(ctx);
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
      ...ctx,
      metadata: {
        dynamicSamplingContext: dsc,
        // eslint-disable-next-line deprecation/deprecation
        ...ctx.metadata,
      },
    });
  }

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
