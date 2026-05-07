import type { DsnComponents } from '../types-hoist/dsn';
import type { MetricContainerItem, MetricEnvelope } from '../types-hoist/envelope';
import type { SerializedMetric } from '../types-hoist/metric';
import type { SdkMetadata } from '../types-hoist/sdkmetadata';
import { dsnToString } from '../utils/dsn';
import { createEnvelope } from '../utils/envelope';
import { isBrowser } from '../utils/isBrowser';

/**
 * Creates a metric container envelope item for a list of metrics.
 *
 * @param items - The metrics to include in the envelope.
 * @param inferUserData - If true, tells Relay to infer the end-user IP and User-Agent from the incoming request.
 *                        Only emitted as `ingest_settings` in browser environments.
 * @returns The created metric container envelope item.
 */
export function createMetricContainerEnvelopeItem(
  items: Array<SerializedMetric>,
  inferUserData?: boolean,
): MetricContainerItem {
  const inferSetting = inferUserData ? 'auto' : 'never';
  return [
    {
      type: 'trace_metric',
      item_count: items.length,
      content_type: 'application/vnd.sentry.items.trace-metric+json',
    } as MetricContainerItem[0],
    {
      version: 2,
      ...(isBrowser() && {
        ingest_settings: { infer_ip: inferSetting, infer_user_agent: inferSetting },
      }),
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
 * @param inferUserData - If true, tells Relay to infer the end-user IP and User-Agent from the incoming request.
 * @returns The created envelope.
 */
export function createMetricEnvelope(
  metrics: Array<SerializedMetric>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
  inferUserData?: boolean,
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

  return createEnvelope<MetricEnvelope>(headers, [createMetricContainerEnvelopeItem(metrics, inferUserData)]);
}
