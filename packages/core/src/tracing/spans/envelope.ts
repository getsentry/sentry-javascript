import type { Client } from '../../client';
import type { DynamicSamplingContext, SpanContainerItem, SpanV2Envelope } from '../../types-hoist/envelope';
import type { SerializedSpan } from '../../types-hoist/span';
import { dsnToString } from '../../utils/dsn';
import { createEnvelope } from '../../utils/envelope';

/**
 * Creates a span v2 span streaming envelope
 */
export function createSpanV2Envelope(
  serializedSpans: Array<SerializedSpan>,
  dsc: Partial<DynamicSamplingContext>,
  client: Client,
): SpanV2Envelope {
  const dsn = client.getDsn();
  const tunnel = client.getOptions().tunnel;
  const sdk = client.getOptions()._metadata?.sdk;

  const headers: SpanV2Envelope[0] = {
    sent_at: new Date().toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(sdk && { sdk }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const spanContainer: SpanContainerItem = [
    { type: 'span', item_count: serializedSpans.length, content_type: 'application/vnd.sentry.items.span.v2+json' },
    { items: serializedSpans },
  ];

  return createEnvelope<SpanV2Envelope>(headers, [spanContainer]);
}

function dscHasRequiredProps(dsc: Partial<DynamicSamplingContext>): dsc is DynamicSamplingContext {
  return !!dsc.trace_id && !!dsc.public_key;
}
