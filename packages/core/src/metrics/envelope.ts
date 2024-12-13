import type { Client, DsnComponents, MetricBucketItem, SdkMetadata, StatsdEnvelope, StatsdItem } from '../types-hoist';
import { dsnToString } from '../utils-hoist/dsn';
import { createEnvelope } from '../utils-hoist/envelope';
import { logger } from '../utils-hoist/logger';
import { serializeMetricBuckets } from './utils';

/**
 * Captures aggregated metrics to the supplied client.
 */
export function captureAggregateMetrics(client: Client, metricBucketItems: Array<MetricBucketItem>): void {
  logger.log(`Flushing aggregated metrics, number of metrics: ${metricBucketItems.length}`);
  const dsn = client.getDsn();
  const metadata = client.getSdkMetadata();
  const tunnel = client.getOptions().tunnel;

  const metricsEnvelope = createMetricEnvelope(metricBucketItems, dsn, metadata, tunnel);

  // sendEnvelope should not throw
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  client.sendEnvelope(metricsEnvelope);
}

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

function createMetricEnvelopeItem(metricBucketItems: MetricBucketItem[]): StatsdItem {
  const payload = serializeMetricBuckets(metricBucketItems);
  const metricHeaders: StatsdItem[0] = {
    type: 'statsd',
    length: payload.length,
  };
  return [metricHeaders, payload];
}
