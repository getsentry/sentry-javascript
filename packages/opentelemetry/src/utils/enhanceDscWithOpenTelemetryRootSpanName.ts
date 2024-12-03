import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, hasTracingEnabled, spanToJSON } from '@sentry/core';
import type { Client } from '@sentry/core';
import { getSamplingDecision } from './getSamplingDecision';
import { parseSpanDescription } from './parseSpanDescription';
import { spanHasName } from './spanTypes';

/**
 * Setup a DSC handler on the passed client,
 * ensuring that the transaction name is inferred from the span correctly.
 */
export function enhanceDscWithOpenTelemetryRootSpanName(client: Client): void {
  client.on('createDsc', (dsc, rootSpan) => {
    if (!rootSpan) {
      return;
    }

    // We want to overwrite the transaction on the DSC that is created by default in core
    // The reason for this is that we want to infer the span name, not use the initial one
    // Otherwise, we'll get names like "GET" instead of e.g. "GET /foo"
    // `parseSpanDescription` takes the attributes of the span into account for the name
    // This mutates the passed-in DSC

    const jsonSpan = spanToJSON(rootSpan);
    const attributes = jsonSpan.data || {};
    const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

    const { description } = spanHasName(rootSpan) ? parseSpanDescription(rootSpan) : { description: undefined };
    if (source !== 'url' && description) {
      dsc.transaction = description;
    }

    // Also ensure sampling decision is correctly inferred
    // In core, we use `spanIsSampled`, which just looks at the trace flags
    // but in OTEL, we use a slightly more complex logic to be able to differntiate between unsampled and deferred sampling
    if (hasTracingEnabled()) {
      const sampled = getSamplingDecision(rootSpan.spanContext());
      dsc.sampled = sampled == undefined ? undefined : String(sampled);
    }
  });
}
