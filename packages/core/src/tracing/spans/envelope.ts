import type { Client } from '../../client';
import type { DynamicSamplingContext, SpanContainerItem, StreamedSpanEnvelope } from '../../types-hoist/envelope';
import type { SerializedStreamedSpan } from '../../types-hoist/span';
import { dsnToString } from '../../utils/dsn';
import { createEnvelope, getSdkMetadataForEnvelopeHeader } from '../../utils/envelope';

/**
 * Creates a span v2 span streaming envelope
 */
export function createStreamedSpanEnvelope(
  serializedSpans: Array<SerializedStreamedSpan>,
  dsc: Partial<DynamicSamplingContext>,
  client: Client,
): StreamedSpanEnvelope {
  const dsn = client.getDsn();
  const tunnel = client.getOptions().tunnel;
  const sdk = getSdkMetadataForEnvelopeHeader(client.getOptions()._metadata);

  const headers: StreamedSpanEnvelope[0] = {
    sent_at: new Date().toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(sdk && { sdk }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const spanContainer: SpanContainerItem = [
    { type: 'span', item_count: serializedSpans.length, content_type: 'application/vnd.sentry.items.span.v2+json' },
    { items: serializedSpans },
  ];

  return createEnvelope<StreamedSpanEnvelope>(headers, [spanContainer]);
}

function dscHasRequiredProps(dsc: Partial<DynamicSamplingContext>): dsc is DynamicSamplingContext {
  return !!dsc.trace_id && !!dsc.public_key;
}
