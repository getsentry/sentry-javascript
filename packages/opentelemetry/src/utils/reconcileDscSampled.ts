import type { DynamicSamplingContext } from '@sentry/core';

/**
 * Reconcile a freshly-derived DSC's `sampled` flag with the OTel sampling decision.
 *
 * Only applies to a DSC that core generated from the span's (binary) trace flags — never to a frozen
 * incoming DSC from the trace state, which the caller leaves untouched per the propagation spec.
 * Trace flags cannot tell a *deferred* decision (an incoming remote span whose decision lives in the
 * trace state) apart from a definitive *unsampled* one — both read as `traceFlags: NONE`.
 * `getSamplingDecision` resolves this via the OTel trace state, so we let it win here: drop `sampled`
 * when the decision is deferred (`undefined`), and — matching the OTel SDK, whose unsampled spans are
 * nameless non-recording spans — drop the transaction name when the trace is definitively unsampled.
 */
export function reconcileDscSampled(
  dsc: Partial<DynamicSamplingContext>,
  sampled: boolean | undefined,
): Partial<DynamicSamplingContext> {
  const reconciled = { ...dsc };

  if (sampled === undefined) {
    delete reconciled.sampled;
  } else {
    reconciled.sampled = String(sampled);
    if (sampled === false) {
      delete reconciled.transaction;
    }
  }

  return reconciled;
}
