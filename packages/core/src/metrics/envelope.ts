import type { DsnComponents, MetricBucketItem, SdkMetadata, StatsdEnvelope, StatsdItem } from '@sentry/types';
import { createEnvelope, dsnToString } from '@sentry/utils';
import { serializeMetricBuckets } from './utils';

/**
 * Create envelope from a metric aggregate.
 */
export function createMetricEnvelope(
  metricBucketItems: Array<MetricBucketItem>,
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

  if (!!tunnel && dsn) {
    headers.dsn = dsnToString(dsn);
  }

  const item = createMetricEnvelopeItem(metricBucketItems);
  return createEnvelope<StatsdEnvelope>(headers, [item]);
}

function createMetricEnvelopeItem(metricBucketItems: Array<MetricBucketItem>): StatsdItem {
  const payload = serializeMetricBuckets(metricBucketItems);
  const metricHeaders: StatsdItem[0] = {
    type: 'statsd',
    length: payload.length,
  };
  return [metricHeaders, payload];
}
