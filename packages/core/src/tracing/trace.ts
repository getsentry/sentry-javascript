import type { ClientOptions, Scope, SentrySpanArguments, Span, SpanTimeInput, StartSpanOptions } from '@sentry/types';
import { propagationContextFromHeaders } from '@sentry/utils';
import type { AsyncContextStrategy } from '../asyncContext';
import { getMainCarrier } from '../asyncContext';

import { getClient, getCurrentScope, getIsolationScope, withScope } from '../currentScopes';

import { getAsyncContextStrategy } from '../hub';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../semanticAttributes';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { _getSpanForScope, _setSpanForScope } from '../utils/spanOnScope';
import { addChildSpanToSpan, getRootSpan, spanIsSampled, spanTimeInputToSeconds, spanToJSON } from '../utils/spanUtils';
import { freezeDscOnSpan, getDynamicSamplingContextFromSpan } from './dynamicSamplingContext';
import { logSpanStart } from './logSpans';
import { sampleSpan } from './sampling';
import { SentryNonRecordingSpan } from './sentryNonRecordingSpan';
import { SentrySpan } from './sentrySpan';
import { SPAN_STATUS_ERROR } from './spanstatus';
import { setCapturedScopesOnSpan } from './utils';

const SUPPRESS_TRACING_KEY = '__SENTRY_SUPPRESS_TRACING__';

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * If you want to create a span that is not set as active, use {@link startInactiveSpan}.
 *
 * You'll always get a span passed to the callback,
 * it may just be a non-recording span if the span is not sampled or if tracing is disabled.
 */
export function startSpan<T>(context: StartSpanOptions, callback: (span: Span) => T): T {
  const acs = getAcs();
  if (acs.startSpan) {
    return acs.startSpan(context, callback);
  }

  const spanContext = normalizeContext(context);

  return withScope(context.scope, scope => {
    const parentSpan = getParentSpan(scope);

    const shouldSkipSpan = context.onlyIfParent && !parentSpan;
    const activeSpan = shouldSkipSpan
      ? new SentryNonRecordingSpan()
      : createChildSpanOrTransaction({
          parentSpan,
          spanContext,
          forceTransaction: context.forceTransaction,
          scope,
        });

    _setSpanForScope(scope, activeSpan);

    return handleCallbackErrors(
      () => callback(activeSpan),
      () => {
        // Only update the span status if it hasn't been changed yet, and the span is not yet finished
        const { status } = spanToJSON(activeSpan);
        if (activeSpan.isRecording() && (!status || status === 'ok')) {
          activeSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        }
      },
      () => activeSpan.end(),
    );
  });
}

/**
 * Similar to `Sentry.startSpan`. Wraps a function with a transaction/span, but does not finish the span
 * after the function is done automatically. You'll have to call `span.end()` manually.
 *
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * You'll always get a span passed to the callback,
 * it may just be a non-recording span if the span is not sampled or if tracing is disabled.
 */
export function startSpanManual<T>(context: StartSpanOptions, callback: (span: Span, finish: () => void) => T): T {
  const acs = getAcs();
  if (acs.startSpanManual) {
    return acs.startSpanManual(context, callback);
  }

  const spanContext = normalizeContext(context);

  return withScope(context.scope, scope => {
    const parentSpan = getParentSpan(scope);

    const shouldSkipSpan = context.onlyIfParent && !parentSpan;
    const activeSpan = shouldSkipSpan
      ? new SentryNonRecordingSpan()
      : createChildSpanOrTransaction({
          parentSpan,
          spanContext,
          forceTransaction: context.forceTransaction,
          scope,
        });

    _setSpanForScope(scope, activeSpan);

    function finishAndSetSpan(): void {
      activeSpan.end();
    }

    return handleCallbackErrors(
      () => callback(activeSpan, finishAndSetSpan),
      () => {
        // Only update the span status if it hasn't been changed yet, and the span is not yet finished
        const { status } = spanToJSON(activeSpan);
        if (activeSpan.isRecording() && (!status || status === 'ok')) {
          activeSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        }
      },
    );
  });
}

/**
 * Creates a span. This span is not set as active, so will not get automatic instrumentation spans
 * as children or be able to be accessed via `Sentry.getActiveSpan()`.
 *
 * If you want to create a span that is set as active, use {@link startSpan}.
 *
 * This function will always return a span,
 * it may just be a non-recording span if the span is not sampled or if tracing is disabled.
 */
export function startInactiveSpan(context: StartSpanOptions): Span {
  const acs = getAcs();
  if (acs.startInactiveSpan) {
    return acs.startInactiveSpan(context);
  }

  const spanContext = normalizeContext(context);

  const scope = context.scope || getCurrentScope();
  const parentSpan = getParentSpan(scope);

  const shouldSkipSpan = context.onlyIfParent && !parentSpan;

  if (shouldSkipSpan) {
    return new SentryNonRecordingSpan();
  }

  return createChildSpanOrTransaction({
    parentSpan,
    spanContext,
    forceTransaction: context.forceTransaction,
    scope,
  });
}

/**
 * Continue a trace from `sentry-trace` and `baggage` values.
 * These values can be obtained from incoming request headers, or in the browser from `<meta name="sentry-trace">`
 * and `<meta name="baggage">` HTML tags.
 *
 * Spans started with `startSpan`, `startSpanManual` and `startInactiveSpan`, within the callback will automatically
 * be attached to the incoming trace.
 */
export const continueTrace = <V>(
  {
    sentryTrace,
    baggage,
  }: {
    sentryTrace: Parameters<typeof propagationContextFromHeaders>[0];
    baggage: Parameters<typeof propagationContextFromHeaders>[1];
  },
  callback: () => V,
): V => {
  return withScope(scope => {
    const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
    scope.setPropagationContext(propagationContext);
    return callback();
  });
};

/**
 * Forks the current scope and sets the provided span as active span in the context of the provided callback. Can be
 * passed `null` to start an entirely new span tree.
 *
 * @param span Spans started in the context of the provided callback will be children of this span. If `null` is passed,
 * spans started within the callback will not be attached to a parent span.
 * @param callback Execution context in which the provided span will be active. Is passed the newly forked scope.
 * @returns the value returned from the provided callback function.
 */
export function withActiveSpan<T>(span: Span | null, callback: (scope: Scope) => T): T {
  const acs = getAcs();
  if (acs.withActiveSpan) {
    return acs.withActiveSpan(span, callback);
  }

  return withScope(scope => {
    _setSpanForScope(scope, span || undefined);
    return callback(scope);
  });
}

/** Suppress tracing in the given callback, ensuring no spans are generated inside of it. */
export function suppressTracing<T>(callback: () => T): T {
  const acs = getAcs();

  if (acs.suppressTracing) {
    return acs.suppressTracing(callback);
  }

  return withScope(scope => {
    scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });
    return callback();
  });
}

function createChildSpanOrTransaction({
  parentSpan,
  spanContext,
  forceTransaction,
  scope,
}: {
  parentSpan: SentrySpan | undefined;
  spanContext: SentrySpanArguments;
  forceTransaction?: boolean;
  scope: Scope;
}): Span {
  if (!hasTracingEnabled()) {
    return new SentryNonRecordingSpan();
  }

  const isolationScope = getIsolationScope();

  let span: Span;
  if (parentSpan && !forceTransaction) {
    span = _startChildSpan(parentSpan, scope, spanContext);
    addChildSpanToSpan(parentSpan, span);
  } else if (parentSpan) {
    // If we forced a transaction but have a parent span, make sure to continue from the parent span, not the scope
    const dsc = getDynamicSamplingContextFromSpan(parentSpan);
    const { traceId, spanId: parentSpanId } = parentSpan.spanContext();
    const parentSampled = spanIsSampled(parentSpan);

    span = _startRootSpan(
      {
        traceId,
        parentSpanId,
        ...spanContext,
      },
      scope,
      parentSampled,
    );

    freezeDscOnSpan(span, dsc);
  } else {
    const {
      traceId,
      dsc,
      parentSpanId,
      sampled: parentSampled,
    } = {
      ...isolationScope.getPropagationContext(),
      ...scope.getPropagationContext(),
    };

    span = _startRootSpan(
      {
        traceId,
        parentSpanId,
        ...spanContext,
      },
      scope,
      parentSampled,
    );

    if (dsc) {
      freezeDscOnSpan(span, dsc);
    }
  }

  logSpanStart(span);

  setCapturedScopesOnSpan(span, scope, isolationScope);

  return span;
}

/**
 * This converts StartSpanOptions to SentrySpanArguments.
 * For the most part (for now) we accept the same options,
 * but some of them need to be transformed.
 *
 * Eventually the StartSpanOptions will be more aligned with OpenTelemetry.
 */
function normalizeContext(context: StartSpanOptions): SentrySpanArguments {
  if (context.startTime) {
    const ctx: SentrySpanArguments & { startTime?: SpanTimeInput } = { ...context };
    ctx.startTimestamp = spanTimeInputToSeconds(context.startTime);
    delete ctx.startTime;
    return ctx;
  }

  return context;
}

function getAcs(): AsyncContextStrategy {
  const carrier = getMainCarrier();
  return getAsyncContextStrategy(carrier);
}

function _startRootSpan(spanArguments: SentrySpanArguments, scope: Scope, parentSampled?: boolean): SentrySpan {
  const client = getClient();
  const options: Partial<ClientOptions> = (client && client.getOptions()) || {};

  const { name = '', attributes } = spanArguments;
  const [sampled, sampleRate] = scope.getScopeData().sdkProcessingMetadata[SUPPRESS_TRACING_KEY]
    ? [false]
    : sampleSpan(options, {
        name,
        parentSampled,
        attributes,
        transactionContext: {
          name,
          parentSampled,
        },
      });

  const rootSpan = new SentrySpan({
    ...spanArguments,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
      ...spanArguments.attributes,
    },
    sampled,
  });
  if (sampleRate !== undefined) {
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, sampleRate);
  }

  if (client) {
    client.emit('spanStart', rootSpan);
  }

  return rootSpan;
}

/**
 * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
 * This inherits the sampling decision from the parent span.
 */
function _startChildSpan(parentSpan: Span, scope: Scope, spanArguments: SentrySpanArguments): Span {
  const { spanId, traceId } = parentSpan.spanContext();
  const sampled = scope.getScopeData().sdkProcessingMetadata[SUPPRESS_TRACING_KEY] ? false : spanIsSampled(parentSpan);

  const childSpan = sampled
    ? new SentrySpan({
        ...spanArguments,
        parentSpanId: spanId,
        traceId,
        sampled,
      })
    : new SentryNonRecordingSpan();

  addChildSpanToSpan(parentSpan, childSpan);

  const client = getClient();
  if (client) {
    client.emit('spanStart', childSpan);
    // If it has an endTimestamp, it's already ended
    if (spanArguments.endTimestamp) {
      client.emit('spanEnd', childSpan);
    }
  }

  return childSpan;
}

function getParentSpan(scope: Scope): SentrySpan | undefined {
  const span = _getSpanForScope(scope) as SentrySpan | undefined;

  if (!span) {
    return undefined;
  }

  const client = getClient();
  const options: Partial<ClientOptions> = client ? client.getOptions() : {};
  if (options.parentSpanIsAlwaysRootSpan) {
    return getRootSpan(span) as SentrySpan;
  }

  return span;
}
