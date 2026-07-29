import type { Client } from '@sentry/core';
import { hasSpansEnabled, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, spanToJSON } from '@sentry/core';
import { getSampledForPropagation } from './getSamplingDecision';

/**
 * Setup a DSC handler on the passed client,
 * ensuring that the transaction name is inferred from the span correctly.
 */
export function enhanceDscWithOpenTelemetryRootSpanName(client: Client): void {
  client.on('createDsc', (dsc, rootSpan) => {
    if (!rootSpan) {
      return;
    }

    const jsonSpan = spanToJSON(rootSpan);
    const attributes = jsonSpan.data;
    const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
    const description = jsonSpan.description;

    const sampled = getSampledForPropagation(rootSpan, client);

    // We want to overwrite the transaction on the DSC that is created by default in core, so that we
    // infer the span name (e.g. "GET /foo" instead of "GET"); `parseSpanDescription` reads the span
    // attributes. This mutates the passed-in DSC.
    // A negatively sampled trace carries no transaction name in its DSC, matching the OTel SDK whose
    // unsampled spans are nameless non-recording spans. Core derives one from the span name, so we
    // drop it here for native (SentryTracerProvider) spans that do have a name.
    if (sampled === false) {
      delete dsc.transaction;
    } else if (description) {
      if (source !== 'url') {
        dsc.transaction = description;
      }
    }

    // Only write the sampling decision in tracing mode. In TwP mode it is deferred (read from the
    // scope/incoming trace state), so we leave any value core already resolved untouched.
    if (hasSpansEnabled()) {
      dsc.sampled = sampled == undefined ? undefined : String(sampled);
    }
  });
}
