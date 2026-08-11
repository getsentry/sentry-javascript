import type { Client } from '../../client';
import type { DynamicSamplingContext, SpanContainerItem, StreamedSpanEnvelope } from '../../types/envelope';
import type { SerializedStreamedSpan } from '../../types/span';
import { dsnToString } from '../../utils/dsn';
import { createEnvelope, getSdkMetadataForEnvelopeHeader } from '../../utils/envelope';
import { isBrowser } from '../../utils/isBrowser';
import { safeDateNow } from '../../utils/randomSafeContext';

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
    sent_at: new Date(safeDateNow()).toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(sdk && { sdk }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  return createEnvelope<StreamedSpanEnvelope>(headers, [createSpanContainerItem(serializedSpans, client)]);
}

/**
 * Builds a span v2 container envelope item from already-serialized streamed spans.
 */
function createSpanContainerItem(serializedSpans: Array<SerializedStreamedSpan>, client: Client): SpanContainerItem {
  const inferSetting = client.getDataCollectionOptions().userInfo ? 'auto' : 'never';

  return [
    { type: 'span', item_count: serializedSpans.length, content_type: 'application/vnd.sentry.items.span.v2+json' },
    {
      version: 2,
      ingest_settings: isBrowser() ? { infer_ip: inferSetting, infer_user_agent: inferSetting } : undefined,
      items: serializedSpans,
    },
  ];
}

function dscHasRequiredProps(dsc: Partial<DynamicSamplingContext>): dsc is DynamicSamplingContext {
  return !!dsc.trace_id && !!dsc.public_key;
}
