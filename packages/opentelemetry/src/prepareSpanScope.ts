import type { Client } from '@sentry/core';
import { _INTERNAL_safeMathRandom, _INTERNAL_setSpanForScope, getDynamicSamplingContextFromSpan } from '@sentry/core';
import { SENTRY_TRACE_STATE_DSC } from './constants';
import { getSamplingDecision } from './utils/getSamplingDecision';

/**
 * Registers the `prepareSpanScope` hook on the client.
 *
 * A remote parent is an incoming trace on the ambient OTel context, set by the propagator. It
 * cannot be used as a local parent span. The hook continues its trace through the propagation
 * context of a forked scope instead, so the span is created as a root span of the incoming trace,
 * like the OpenTelemetry SDK does for remote parents.
 */
export function registerPrepareSpanScope(client: Client): void {
  client.on('prepareSpanScope', spanScope => {
    const { scope, parentSpan } = spanScope;
    if (!parentSpan?.spanContext().isRemote) {
      return;
    }

    const { spanId, traceId, traceState } = parentSpan.spanContext();
    const dsc = getDynamicSamplingContextFromSpan(parentSpan);
    const sampleRand = typeof dsc.sample_rand === 'string' ? Number(dsc.sample_rand) : undefined;

    // Only freeze the DSC when the remote parent actually carried one (i.e. there was incoming
    // baggage). Otherwise leave it unset so it is derived dynamically from the span.
    const hasIncomingDsc = !!traceState?.get(SENTRY_TRACE_STATE_DSC);

    const forkedScope = scope.clone();
    forkedScope.setPropagationContext({
      traceId,
      parentSpanId: spanId,
      sampled: getSamplingDecision(parentSpan.spanContext()),
      dsc: hasIncomingDsc ? dsc : undefined,
      sampleRand: typeof sampleRand === 'number' && !Number.isNaN(sampleRand) ? sampleRand : _INTERNAL_safeMathRandom(),
    });
    _INTERNAL_setSpanForScope(forkedScope, undefined);

    spanScope.scope = forkedScope;
    spanScope.parentSpan = undefined;
  });
}
