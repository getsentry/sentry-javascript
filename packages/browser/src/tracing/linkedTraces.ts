import type { Client, PropagationContext, Span, SpanContextData } from '@sentry/core';
import {
  debug,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE,
  spanToJSON,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../exports';

export interface PreviousTraceInfo {
  /**
   * Span context of the previous trace's local root span
   */
  spanContext: SpanContextData;

  /**
   * Timestamp in seconds when the previous trace was started
   */
  startTimestamp: number;

  /**
   * sample rate of the previous trace
   */
  sampleRate: number;

  /**
   * The sample rand of the previous trace
   */
  sampleRand: number;
}

// 1h in seconds
export const PREVIOUS_TRACE_MAX_DURATION = 3600;

// session storage key
export const PREVIOUS_TRACE_KEY = 'sentry_previous_trace';

export const PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE = 'sentry.previous_trace';

/**
 * Takes care of linking traces and applying the (consistent) sampling behavoiour based on the passed options
 * @param options - options for linking traces and consistent trace sampling (@see BrowserTracingOptions)
 * @param client - Sentry client
 */
export function linkTraces(
  client: Client,
  {
    linkPreviousTrace,
    consistentTraceSampling,
  }: {
    linkPreviousTrace: 'session-storage' | 'in-memory';
    consistentTraceSampling: boolean;
  },
): void {
  const useSessionStorage = linkPreviousTrace === 'session-storage';

  let inMemoryPreviousTraceInfo = useSessionStorage ? getPreviousTraceFromSessionStorage() : undefined;

  client.on('spanStart', span => {
    if (getRootSpan(span) !== span) {
      return;
    }

    const oldPropagationContext = getCurrentScope().getPropagationContext();
    inMemoryPreviousTraceInfo = addPreviousTraceSpanLink(inMemoryPreviousTraceInfo, span, oldPropagationContext);

    if (useSessionStorage) {
      storePreviousTraceInSessionStorage(inMemoryPreviousTraceInfo);
    }
  });

  let isFirstTraceOnPageload = true;
  if (consistentTraceSampling) {
    /*
    When users opt into `consistentTraceSampling`, we need to ensure that we propagate
    the previous trace's sample rate and rand to the current trace. This is necessary because otherwise, span
    metric extrapolation is inaccurate, as we'd propagate too high of a sample rate for the subsequent traces.

    So therefore, we pretend that the previous trace was the parent trace of the newly started trace. To do that,
    we mutate the propagation context of the current trace and set the sample rate and sample rand of the previous trace.
    Timing-wise, it is fine because it happens before we even sample the root span.

    @see https://github.com/getsentry/sentry-javascript/issues/15754
    */
    client.on('beforeSampling', mutableSamplingContextData => {
      if (!inMemoryPreviousTraceInfo) {
        return;
      }

      const scope = getCurrentScope();
      const currentPropagationContext = scope.getPropagationContext();

      // We do not want to force-continue the sampling decision if we continue a trace
      // that was started on the backend. Most prominently, this will happen in MPAs where
      // users hard-navigate between pages. In this case, the sampling decision of a potentially
      // started trace on the server takes precedence.
      // Why? We want to prioritize inter-trace consistency over intra-trace consistency.
      if (isFirstTraceOnPageload && currentPropagationContext.parentSpanId) {
        isFirstTraceOnPageload = false;
        return;
      }

      scope.setPropagationContext({
        ...currentPropagationContext,
        dsc: {
          ...currentPropagationContext.dsc,
          sample_rate: String(inMemoryPreviousTraceInfo.sampleRate),
          sampled: String(spanContextSampled(inMemoryPreviousTraceInfo.spanContext)),
        },
        sampleRand: inMemoryPreviousTraceInfo.sampleRand,
      });

      mutableSamplingContextData.parentSampled = spanContextSampled(inMemoryPreviousTraceInfo.spanContext);
      mutableSamplingContextData.parentSampleRate = inMemoryPreviousTraceInfo.sampleRate;

      mutableSamplingContextData.spanAttributes = {
        ...mutableSamplingContextData.spanAttributes,
        [SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]: inMemoryPreviousTraceInfo.sampleRate,
      };
    });
  }
}

/**
 * Adds a previous_trace span link to the passed span if the passed
 * previousTraceInfo is still valid.
 *
 * @returns the updated previous trace info (based on the current span/trace) to
 * be used on the next call
 */
export function addPreviousTraceSpanLink(
  previousTraceInfo: PreviousTraceInfo | undefined,
  span: Span,
  oldPropagationContext: PropagationContext,
): PreviousTraceInfo {
  const spanJson = spanToJSON(span);

  function getSampleRate(): number {
    try {
      return (
        Number(oldPropagationContext.dsc?.sample_rate) ?? Number(spanJson.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE])
      );
    } catch {
      return 0;
    }
  }

  const updatedPreviousTraceInfo = {
    spanContext: span.spanContext(),
    startTimestamp: spanJson.start_timestamp,
    sampleRate: getSampleRate(),
    sampleRand: oldPropagationContext.sampleRand,
  };

  if (!previousTraceInfo) {
    return updatedPreviousTraceInfo;
  }

  const previousTraceSpanCtx = previousTraceInfo.spanContext;
  if (previousTraceSpanCtx.traceId === spanJson.trace_id) {
    // This means, we're still in the same trace so let's not update the previous trace info
    // or add a link to the current span.
    // Once we move away from the long-lived, route-based trace model, we can remove this cases
    return previousTraceInfo;
  }

  // Only add the link if the startTimeStamp of the previous trace's root span is within
  // PREVIOUS_TRACE_MAX_DURATION (1h) of the current root span's startTimestamp
  // This is done to
  // - avoid adding links to "stale" traces
  // - enable more efficient querying for previous/next traces in Sentry
  if (Date.now() / 1000 - previousTraceInfo.startTimestamp <= PREVIOUS_TRACE_MAX_DURATION) {
    if (DEBUG_BUILD) {
      debug.log(
        `Adding previous_trace \`${JSON.stringify(previousTraceSpanCtx)}\` link to span \`${JSON.stringify({
          op: spanJson.op,
          ...span.spanContext(),
        })}\``,
      );
    }

    span.addLink({
      context: previousTraceSpanCtx,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    });

    // TODO: Remove this once EAP can store span links. We currently only set this attribute so that we
    // can obtain the previous trace information from the EAP store. Long-term, EAP will handle
    // span links and then we should remove this again. Also throwing in a TODO(v11), to remind us
    // to check this at v11 time :)
    span.setAttribute(
      PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE,
      `${previousTraceSpanCtx.traceId}-${previousTraceSpanCtx.spanId}-${
        spanContextSampled(previousTraceSpanCtx) ? 1 : 0
      }`,
    );
  }

  return updatedPreviousTraceInfo;
}

/**
 * Stores @param previousTraceInfo in sessionStorage.
 */
export function storePreviousTraceInSessionStorage(previousTraceInfo: PreviousTraceInfo): void {
  try {
    WINDOW.sessionStorage.setItem(PREVIOUS_TRACE_KEY, JSON.stringify(previousTraceInfo));
  } catch (e) {
    // Ignore potential errors (e.g. if sessionStorage is not available)
    DEBUG_BUILD && debug.warn('Could not store previous trace in sessionStorage', e);
  }
}

/**
 * Retrieves the previous trace from sessionStorage if available.
 */
export function getPreviousTraceFromSessionStorage(): PreviousTraceInfo | undefined {
  try {
    const previousTraceInfo = WINDOW.sessionStorage?.getItem(PREVIOUS_TRACE_KEY);
    // @ts-expect-error - intentionally risking JSON.parse throwing when previousTraceInfo is null to save bundle size
    return JSON.parse(previousTraceInfo);
  } catch {
    return undefined;
  }
}

/**
 * see {@link import('@sentry/core').spanIsSampled}
 */
export function spanContextSampled(ctx: SpanContextData): boolean {
  return ctx.traceFlags === 0x1;
}
