import type { DsnComponents } from '../types-hoist/dsn';
import type { MetricContainerItem, MetricEnvelope } from '../types-hoist/envelope';
import type { SerializedMetric } from '../types-hoist/metric';
import type { SdkMetadata } from '../types-hoist/sdkmetadata';
import { dsnToString } from '../utils/dsn';
import { createEnvelope } from '../utils/envelope';

/**
 * Creates a metric container envelope item for a list of metrics.
 *
 * @param items - The metrics to include in the envelope.
 * @returns The created metric container envelope item.
 */
export function createMetricContainerEnvelopeItem(items: Array<SerializedMetric>): MetricContainerItem {
  return [
    {
      type: 'trace_metric',
      item_count: items.length,
      content_type: 'application/vnd.sentry.items.trace-metric+json',
    } as MetricContainerItem[0],
    {
      items,
    },
  ];
}

/**
 * Creates an envelope for a list of metrics.
 *
 * Metrics from multiple traces can be included in the same envelope.
 *
 * @param metrics - The metrics to include in the envelope.
 * @param metadata - The metadata to include in the envelope.
 * @param tunnel - The tunnel to include in the envelope.
 * @param dsn - The DSN to include in the envelope.
 * @returns The created envelope.
 */
export function createMetricEnvelope(
  metrics: Array<SerializedMetric>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
): MetricEnvelope {
  const headers: MetricEnvelope[0] = {};

  if (metadata?.sdk) {
    headers.sdk = {
      name: metadata.sdk.name,
      version: metadata.sdk.version,
    };
  }

  if (!!tunnel && !!dsn) {
    headers.dsn = dsnToString(dsn);
  }

  return createEnvelope<MetricEnvelope>(headers, [createMetricContainerEnvelopeItem(metrics)]);
}
