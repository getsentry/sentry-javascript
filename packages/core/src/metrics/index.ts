import type { DsnComponents, DynamicSamplingContext, SdkMetadata, StatsdEnvelope, StatsdItem } from '@sentry/types';
import { createEnvelope, dropUndefinedKeys, dsnToString } from '@sentry/utils';

/**
 * Create envelope from a metric aggregate.
 */
export function createMetricEnvelope(
  // TODO(abhi): Add type for this
  metricAggregate: string,
  dynamicSamplingContext?: Partial<DynamicSamplingContext>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
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

  if (dynamicSamplingContext) {
    headers.trace = dropUndefinedKeys(dynamicSamplingContext) as DynamicSamplingContext;
  }

  const item = createMetricEnvelopeItem(metricAggregate);
  return createEnvelope<StatsdEnvelope>(headers, [item]);
}

function createMetricEnvelopeItem(metricAggregate: string): StatsdItem {
  const metricHeaders: StatsdItem[0] = {
    type: 'statsd',
  };
  return [metricHeaders, metricAggregate];
}
