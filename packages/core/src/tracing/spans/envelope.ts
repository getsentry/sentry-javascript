import type { Client } from '../../client';
import type { DynamicSamplingContext, SpanContainerItem, StreamedSpanEnvelope } from '../../types-hoist/envelope';
import type { SerializedStreamedSpan } from '../../types-hoist/span';
import { dsnToString } from '../../utils/dsn';
import { createEnvelope, getSdkMetadataForEnvelopeHeader } from '../../utils/envelope';
import { isBrowser } from '../../utils/isBrowser';

/**
 * Creates a span v2 span streaming envelope
 */
export function createStreamedSpanEnvelope(
  serializedSpans: Array<SerializedStreamedSpan>,
  dsc: Partial<DynamicSamplingContext>,
  client: Client,
): StreamedSpanEnvelope {
  const options = client.getOptions();
  const dsn = client.getDsn();
  const tunnel = options.tunnel;
  const sdk = getSdkMetadataForEnvelopeHeader(options._metadata);

  const headers: StreamedSpanEnvelope[0] = {
    sent_at: new Date().toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(sdk && { sdk }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const inferSetting = options.sendDefaultPii ? 'auto' : 'never';

  const spanContainer: SpanContainerItem = [
    { type: 'span', item_count: serializedSpans.length, content_type: 'application/vnd.sentry.items.span.v2+json' },
    {
      version: 2,
      ...(isBrowser() && {
        ingest_settings: { infer_ip: inferSetting, infer_useragent: inferSetting },
      }),
      items: serializedSpans,
    },
  ];

  return createEnvelope<StreamedSpanEnvelope>(headers, [spanContainer]);
}

function dscHasRequiredProps(dsc: Partial<DynamicSamplingContext>): dsc is DynamicSamplingContext {
  return !!dsc.trace_id && !!dsc.public_key;
}
