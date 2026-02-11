/* eslint-disable max-lines */

import { getAsyncContextStrategy } from '../asyncContext';
import type { AsyncContextStrategy } from '../asyncContext/types';
import { getMainCarrier } from '../carrier';
import { getClient, getCurrentScope, getIsolationScope, withScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Scope } from '../scope';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../semanticAttributes';
import type { DynamicSamplingContext } from '../types-hoist/envelope';
import type { ClientOptions } from '../types-hoist/options';
import type { SentrySpanArguments, Span, SpanTimeInput } from '../types-hoist/span';
import type { StartSpanOptions } from '../types-hoist/startSpanOptions';
import { baggageHeaderToDynamicSamplingContext } from '../utils/baggage';
import { debug } from '../utils/debug-logger';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { hasSpansEnabled } from '../utils/hasSpansEnabled';
import { parseSampleRate } from '../utils/parseSampleRate';
import { generateTraceId } from '../utils/propagationContext';
import { safeMathRandom } from '../utils/randomSafeContext';
import { _getSpanForScope, _setSpanForScope } from '../utils/spanOnScope';
import { addChildSpanToSpan, getRootSpan, spanIsSampled, spanTimeInputToSeconds, spanToJSON } from '../utils/spanUtils';
import { propagationContextFromHeaders, shouldContinueTrace } from '../utils/tracing';
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
export function startSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T {
  const acs = getAcs();
  if (acs.startSpan) {
    return acs.startSpan(options, callback);
  }

  const spanArguments = parseSentrySpanArguments(options);
  const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;

  // We still need to fork a potentially passed scope, as we set the active span on it
  // and we need to ensure that it is cleaned up properly once the span ends.
  const customForkedScope = customScope?.clone();

  return withScope(customForkedScope, () => {
    // If `options.parentSpan` is defined, we want to wrap the callback in `withActiveSpan`
    const wrapper = getActiveSpanWrapper<T>(customParentSpan);

    return wrapper(() => {
      const scope = getCurrentScope();
      const parentSpan = getParentSpan(scope, customParentSpan);

      const shouldSkipSpan = options.onlyIfParent && !parentSpan;
      const activeSpan = shouldSkipSpan
        ? new SentryNonRecordingSpan()
        : createChildOrRootSpan({
            parentSpan,
            spanArguments,
            forceTransaction,
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
        () => {
          activeSpan.end();
        },
      );
    });
  });
}

/**
 * Similar to `Sentry.startSpan`. Wraps a function with a transaction/span, but does not finish the span
 * after the function is done automatically. Use `span.end()` to end the span.
 *
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * You'll always get a span passed to the callback,
 * it may just be a non-recording span if the span is not sampled or if tracing is disabled.
 */
export function startSpanManual<T>(options: StartSpanOptions, callback: (span: Span, finish: () => void) => T): T {
  const acs = getAcs();
  if (acs.startSpanManual) {
    return acs.startSpanManual(options, callback);
  }

  const spanArguments = parseSentrySpanArguments(options);
  const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;

  const customForkedScope = customScope?.clone();

  return withScope(customForkedScope, () => {
    // If `options.parentSpan` is defined, we want to wrap the callback in `withActiveSpan`
    const wrapper = getActiveSpanWrapper<T>(customParentSpan);

    return wrapper(() => {
      const scope = getCurrentScope();
      const parentSpan = getParentSpan(scope, customParentSpan);

      const shouldSkipSpan = options.onlyIfParent && !parentSpan;
      const activeSpan = shouldSkipSpan
        ? new SentryNonRecordingSpan()
        : createChildOrRootSpan({
            parentSpan,
            spanArguments,
            forceTransaction,
            scope,
          });

      _setSpanForScope(scope, activeSpan);

      return handleCallbackErrors(
        // We pass the `finish` function to the callback, so the user can finish the span manually
        // this is mainly here for historic purposes because previously, we instructed users to call
        // `finish` instead of `span.end()` to also clean up the scope. Nowadays, calling `span.end()`
        // or `finish` has the same effect and we simply leave it here to avoid breaking user code.
        () => callback(activeSpan, () => activeSpan.end()),
        () => {
          // Only update the span status if it hasn't been changed yet, and the span is not yet finished
          const { status } = spanToJSON(activeSpan);
          if (activeSpan.isRecording() && (!status || status === 'ok')) {
            activeSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          }
        },
      );
    });
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
export function startInactiveSpan(options: StartSpanOptions): Span {
  const acs = getAcs();
  if (acs.startInactiveSpan) {
    return acs.startInactiveSpan(options);
  }

  const spanArguments = parseSentrySpanArguments(options);
  const { forceTransaction, parentSpan: customParentSpan } = options;

  // If `options.scope` is defined, we use this as as a wrapper,
  // If `options.parentSpan` is defined, we want to wrap the callback in `withActiveSpan`
  const wrapper = options.scope
    ? (callback: () => Span) => withScope(options.scope, callback)
    : customParentSpan !== undefined
      ? (callback: () => Span) => withActiveSpan(customParentSpan, callback)
      : (callback: () => Span) => callback();

  return wrapper(() => {
    const scope = getCurrentScope();
    const parentSpan = getParentSpan(scope, customParentSpan);

    const shouldSkipSpan = options.onlyIfParent && !parentSpan;

    if (shouldSkipSpan) {
      return new SentryNonRecordingSpan();
    }

    return createChildOrRootSpan({
      parentSpan,
      spanArguments,
      forceTransaction,
      scope,
    });
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
  options: {
    sentryTrace: Parameters<typeof propagationContextFromHeaders>[0];
    baggage: Parameters<typeof propagationContextFromHeaders>[1];
  },
  callback: () => V,
): V => {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  if (acs.continueTrace) {
    return acs.continueTrace(options, callback);
  }

  const { sentryTrace, baggage } = options;

  const client = getClient();
  const incomingDsc = baggageHeaderToDynamicSamplingContext(baggage);
  if (client && !shouldContinueTrace(client, incomingDsc?.org_id)) {
    return startNewTrace(callback);
  }

  return withScope(scope => {
    const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
    scope.setPropagationContext(propagationContext);
    _setSpanForScope(scope, undefined);
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
    // Note: We do not wait for the callback to finish before we reset the metadata
    // the reason for this is that otherwise, in the browser this can lead to very weird behavior
    // as there is only a single top scope, if the callback takes longer to finish,
    // other, unrelated spans may also be suppressed, which we do not want
    // so instead, we only suppress tracing synchronoysly in the browser
    scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });
    const res = callback();
    scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: undefined });
    return res;
  });
}

/**
 * Starts a new trace for the duration of the provided callback. Spans started within the
 * callback will be part of the new trace instead of a potentially previously started trace.
 *
 * Important: Only use this function if you want to override the default trace lifetime and
 * propagation mechanism of the SDK for the duration and scope of the provided callback.
 * The newly created trace will also be the root of a new distributed trace, for example if
 * you make http requests within the callback.
 * This function might be useful if the operation you want to instrument should not be part
 * of a potentially ongoing trace.
 *
 * Default behavior:
 * - Server-side: A new trace is started for each incoming request.
 * - Browser: A new trace is started for each page our route. Navigating to a new route
 *            or page will automatically create a new trace.
 */
export function startNewTrace<T>(callback: () => T): T {
  return withScope(scope => {
    scope.setPropagationContext({
      traceId: generateTraceId(),
      sampleRand: safeMathRandom(),
    });
    DEBUG_BUILD && debug.log(`Starting a new trace with id ${scope.getPropagationContext().traceId}`);
    return withActiveSpan(null, callback);
  });
}

function createChildOrRootSpan({
  parentSpan,
  spanArguments,
  forceTransaction,
  scope,
}: {
  parentSpan: SentrySpan | undefined;
  spanArguments: SentrySpanArguments;
  forceTransaction?: boolean;
  scope: Scope;
}): Span {
  if (!hasSpansEnabled()) {
    const span = new SentryNonRecordingSpan();

    // If this is a root span, we ensure to freeze a DSC
    // So we can have at least partial data here
    if (forceTransaction || !parentSpan) {
      const dsc = {
        sampled: 'false',
        sample_rate: '0',
        transaction: spanArguments.name,
        ...getDynamicSamplingContextFromSpan(span),
      } satisfies Partial<DynamicSamplingContext>;
      freezeDscOnSpan(span, dsc);
    }

    return span;
  }

  const isolationScope = getIsolationScope();

  let span: Span;
  if (parentSpan && !forceTransaction) {
    span = _startChildSpan(parentSpan, scope, spanArguments);
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
        ...spanArguments,
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
        ...spanArguments,
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
 */
function parseSentrySpanArguments(options: StartSpanOptions): SentrySpanArguments {
  const exp = options.experimental || {};
  const initialCtx: SentrySpanArguments = {
    isStandalone: exp.standalone,
    ...options,
  };

  if (options.startTime) {
    const ctx: SentrySpanArguments & { startTime?: SpanTimeInput } = { ...initialCtx };
    ctx.startTimestamp = spanTimeInputToSeconds(options.startTime);
    delete ctx.startTime;
    return ctx;
  }

  return initialCtx;
}

function getAcs(): AsyncContextStrategy {
  const carrier = getMainCarrier();
  return getAsyncContextStrategy(carrier);
}

function _startRootSpan(spanArguments: SentrySpanArguments, scope: Scope, parentSampled?: boolean): SentrySpan {
  const client = getClient();
  const options: Partial<ClientOptions> = client?.getOptions() || {};

  const { name = '' } = spanArguments;

  const mutableSpanSamplingData = { spanAttributes: { ...spanArguments.attributes }, spanName: name, parentSampled };

  // we don't care about the decision for the moment; this is just a placeholder
  client?.emit('beforeSampling', mutableSpanSamplingData, { decision: false });

  // If hook consumers override the parentSampled flag, we will use that value instead of the actual one
  const finalParentSampled = mutableSpanSamplingData.parentSampled ?? parentSampled;
  const finalAttributes = mutableSpanSamplingData.spanAttributes;

  const currentPropagationContext = scope.getPropagationContext();
  const [sampled, sampleRate, localSampleRateWasApplied] = scope.getScopeData().sdkProcessingMetadata[
    SUPPRESS_TRACING_KEY
  ]
    ? [false]
    : sampleSpan(
        options,
        {
          name,
          parentSampled: finalParentSampled,
          attributes: finalAttributes,
          parentSampleRate: parseSampleRate(currentPropagationContext.dsc?.sample_rate),
        },
        currentPropagationContext.sampleRand,
      );

  const rootSpan = new SentrySpan({
    ...spanArguments,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]:
        sampleRate !== undefined && localSampleRateWasApplied ? sampleRate : undefined,
      ...finalAttributes,
    },
    sampled,
  });

  if (!sampled && client) {
    DEBUG_BUILD && debug.log('[Tracing] Discarding root span because its trace was not chosen to be sampled.');
    client.recordDroppedEvent('sample_rate', 'transaction');
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
    : new SentryNonRecordingSpan({ traceId });

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

function getParentSpan(scope: Scope, customParentSpan: Span | null | undefined): SentrySpan | undefined {
  // always use the passed in span directly
  if (customParentSpan) {
    return customParentSpan as SentrySpan;
  }

  // This is different from `undefined` as it means the user explicitly wants no parent span
  if (customParentSpan === null) {
    return undefined;
  }

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

function getActiveSpanWrapper<T>(parentSpan: Span | undefined | null): (callback: () => T) => T {
  return parentSpan !== undefined
    ? (callback: () => T) => {
        return withActiveSpan(parentSpan, callback);
      }
    : (callback: () => T) => callback();
}
