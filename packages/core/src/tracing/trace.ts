import type {
  ClientOptions,
  Scope,
  SentrySpanArguments,
  Span,
  SpanTimeInput,
  StartSpanOptions,
  TransactionArguments,
} from '@sentry/types';

import { propagationContextFromHeaders } from '@sentry/utils';
import type { AsyncContextStrategy } from '../asyncContext';
import { getMainCarrier } from '../asyncContext';
import { getClient, getCurrentScope, getIsolationScope, withScope } from '../currentScopes';

import { getAsyncContextStrategy, getCurrentHub } from '../hub';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '../semanticAttributes';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { hasTracingEnabled } from '../utils/hasTracingEnabled';
import { _getSpanForScope, _setSpanForScope } from '../utils/spanOnScope';
import {
  addChildSpanToSpan,
  getActiveSpan,
  spanIsSampled,
  spanTimeInputToSeconds,
  spanToJSON,
} from '../utils/spanUtils';
import { getDynamicSamplingContextFromSpan } from './dynamicSamplingContext';
import { logSpanStart } from './logSpans';
import { sampleSpan } from './sampling';
import { SentryNonRecordingSpan } from './sentryNonRecordingSpan';
import { SentrySpan } from './sentrySpan';
import { SPAN_STATUS_ERROR } from './spanstatus';
import { Transaction } from './transaction';
import { setCapturedScopesOnSpan } from './utils';

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
    const parentSpan = _getSpanForScope(scope) as SentrySpan | undefined;

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
    const parentSpan = _getSpanForScope(scope) as SentrySpan | undefined;

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
  const parentSpan = context.scope
    ? (_getSpanForScope(context.scope) as SentrySpan | undefined)
    : (getActiveSpan() as SentrySpan | undefined);

  const shouldSkipSpan = context.onlyIfParent && !parentSpan;

  if (shouldSkipSpan) {
    return new SentryNonRecordingSpan();
  }

  const scope = context.scope || getCurrentScope();

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

function createChildSpanOrTransaction({
  parentSpan,
  spanContext,
  forceTransaction,
  scope,
}: {
  parentSpan: SentrySpan | undefined;
  spanContext: TransactionArguments;
  forceTransaction?: boolean;
  scope: Scope;
}): Span {
  if (!hasTracingEnabled()) {
    return new SentryNonRecordingSpan();
  }

  const isolationScope = getIsolationScope();

  let span: Span;
  if (parentSpan && !forceTransaction) {
    span = _startChild(parentSpan, spanContext);
    addChildSpanToSpan(parentSpan, span);
  } else if (parentSpan) {
    // If we forced a transaction but have a parent span, make sure to continue from the parent span, not the scope
    const dsc = getDynamicSamplingContextFromSpan(parentSpan);
    const { traceId, spanId: parentSpanId } = parentSpan.spanContext();
    const sampled = spanIsSampled(parentSpan);

    span = _startTransaction({
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

    span = _startTransaction({
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

  logSpanStart(span);

  // TODO v8: Technically `startTransaction` can return undefined, which is not reflected by the types
  // This happens if tracing extensions have not been added
  // In this case, we just want to return a non-recording span
  if (!span) {
    return new SentryNonRecordingSpan();
  }

  setCapturedScopesOnSpan(span, scope, isolationScope);

  return span;
}

/**
 * This converts StartSpanOptions to TransactionArguments.
 * For the most part (for now) we accept the same options,
 * but some of them need to be transformed.
 *
 * Eventually the StartSpanOptions will be more aligned with OpenTelemetry.
 */
function normalizeContext(context: StartSpanOptions): TransactionArguments {
  if (context.startTime) {
    const ctx: TransactionArguments & { startTime?: SpanTimeInput } = { ...context };
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

function _startTransaction(transactionContext: TransactionArguments): Transaction {
  const client = getClient();
  const options: Partial<ClientOptions> = (client && client.getOptions()) || {};

  const { name, parentSampled, attributes } = transactionContext;
  const [sampled, sampleRate] = sampleSpan(options, {
    name,
    parentSampled,
    attributes,
    transactionContext,
  });

  // eslint-disable-next-line deprecation/deprecation
  const transaction = new Transaction({ ...transactionContext, sampled }, getCurrentHub());
  if (sampleRate !== undefined) {
    transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, sampleRate);
  }

  if (client) {
    client.emit('spanStart', transaction);
  }

  return transaction;
}

/**
 * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
 * This inherits the sampling decision from the parent span.
 */
function _startChild(parentSpan: Span, spanContext: SentrySpanArguments): SentrySpan {
  const { spanId, traceId } = parentSpan.spanContext();
  const sampled = spanIsSampled(parentSpan);

  const childSpan = new SentrySpan({
    ...spanContext,
    parentSpanId: spanId,
    traceId,
    sampled,
  });

  addChildSpanToSpan(parentSpan, childSpan);

  const client = getClient();
  if (client) {
    client.emit('spanStart', childSpan);
    // If it has an endTimestamp, it's already ended
    if (spanContext.endTimestamp) {
      client.emit('spanEnd', childSpan);
    }
  }

  return childSpan;
}
