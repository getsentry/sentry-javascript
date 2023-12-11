import type { DsnComponents, SdkMetadata, StatsdEnvelope, StatsdItem } from '@sentry/types';
import { createEnvelope, dsnToString } from '@sentry/utils';

/**
 * Create envelope from a metric aggregate.
 */
export function createMetricEnvelope(
  metricAggregate: string,
  dsn?: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): StatsdEnvelope {
  const headers: StatsdEnvelope[0] = {
    sent_at: new Date().toISOString(),
  };

  if (metadata && metadata.sdk) {
    headers.sdk = {
      name: metadata.sdk.name,
      version: metadata.sdk.version,
    };
  }

  if (!!tunnel && !!dsn) {
    headers.dsn = dsnToString(dsn);
  }

  const item = createMetricEnvelopeItem(metricAggregate);
  return createEnvelope<StatsdEnvelope>(headers, [item]);
}

function createMetricEnvelopeItem(metricAggregate: string): StatsdItem {
  const metricHeaders: StatsdItem[0] = {
    type: 'statsd',
    content_type: 'application/octet-stream',
    length: metricAggregate.length,
  };
  return [metricHeaders, metricAggregate];
}
