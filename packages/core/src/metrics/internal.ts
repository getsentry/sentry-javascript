import { getGlobalSingleton } from '../carrier';
import type { Client } from '../client';
import { getClient, getCurrentScope, getGlobalScope, getIsolationScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Scope, ScopeData } from '../scope';
import type { Integration } from '../types-hoist/integration';
import type { Metric, SerializedMetric, SerializedMetricAttributeValue } from '../types-hoist/metric';
import { mergeScopeData } from '../utils/applyScopeDataToEvent';
import { debug } from '../utils/debug-logger';
import { _getSpanForScope } from '../utils/spanOnScope';
import { timestampInSeconds } from '../utils/time';
import { _getTraceInfoFromScope } from '../utils/trace-info';
import { createMetricEnvelope } from './envelope';

const MAX_METRIC_BUFFER_SIZE = 1000;

/**
 * Converts a metric attribute to a serialized metric attribute.
 *
 * @param value - The value of the metric attribute.
 * @returns The serialized metric attribute.
 */
export function metricAttributeToSerializedMetricAttribute(value: unknown): SerializedMetricAttributeValue {
  switch (typeof value) {
    case 'number':
      if (Number.isInteger(value)) {
        return {
          value,
          type: 'integer',
        };
      }
      return {
        value,
        type: 'double',
      };
    case 'boolean':
      return {
        value,
        type: 'boolean',
      };
    case 'string':
      return {
        value,
        type: 'string',
      };
    default: {
      let stringValue = '';
      try {
        stringValue = JSON.stringify(value) ?? '';
      } catch {
        // Do nothing
      }
      return {
        value: stringValue,
        type: 'string',
      };
    }
  }
}

/**
 * Sets a metric attribute if the value exists and the attribute key is not already present.
 *
 * @param metricAttributes - The metric attributes object to modify.
 * @param key - The attribute key to set.
 * @param value - The value to set (only sets if truthy and key not present).
 * @param setEvenIfPresent - Whether to set the attribute if it is present. Defaults to true.
 */
function setMetricAttribute(
  metricAttributes: Record<string, unknown>,
  key: string,
  value: unknown,
  setEvenIfPresent = true,
): void {
  if (value && (setEvenIfPresent || !(key in metricAttributes))) {
    metricAttributes[key] = value;
  }
}

/**
 * Captures a serialized metric event and adds it to the metric buffer for the given client.
 *
 * @param client - A client. Uses the current client if not provided.
 * @param serializedMetric - The serialized metric event to capture.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function _INTERNAL_captureSerializedMetric(client: Client, serializedMetric: SerializedMetric): void {
  const bufferMap = _getBufferMap();

  const metricBuffer = _INTERNAL_getMetricBuffer(client);
  if (metricBuffer === undefined) {
    bufferMap.set(client, [serializedMetric]);
  } else {
    bufferMap.set(client, [...metricBuffer, serializedMetric]);
    if (metricBuffer.length >= MAX_METRIC_BUFFER_SIZE) {
      _INTERNAL_flushMetricsBuffer(client, metricBuffer);
    }
  }
}

/**
 * Options for capturing a metric internally.
 */
export interface InternalCaptureMetricOptions {
  /**
   * The scope to capture the metric with.
   */
  scope?: Scope;

  /**
   * A function to capture the serialized metric.
   */
  captureSerializedMetric?: (client: Client, metric: SerializedMetric) => void;
}

/**
 * Enriches metric with all contextual attributes (user, SDK metadata, replay, etc.)
 */
function _enrichMetricAttributes(beforeMetric: Metric, client: Client, currentScope: Scope): Metric {
  const { release, environment } = client.getOptions();

  const processedMetricAttributes = {
    ...beforeMetric.attributes,
  };

  // Add user attributes
  const {
    user: { id, email, username },
  } = getMergedScopeData(currentScope);
  setMetricAttribute(processedMetricAttributes, 'user.id', id, false);
  setMetricAttribute(processedMetricAttributes, 'user.email', email, false);
  setMetricAttribute(processedMetricAttributes, 'user.name', username, false);

  // Add Sentry metadata
  setMetricAttribute(processedMetricAttributes, 'sentry.release', release);
  setMetricAttribute(processedMetricAttributes, 'sentry.environment', environment);

  // Add SDK metadata
  const { name, version } = client.getSdkMetadata()?.sdk ?? {};
  setMetricAttribute(processedMetricAttributes, 'sentry.sdk.name', name);
  setMetricAttribute(processedMetricAttributes, 'sentry.sdk.version', version);

  // Add replay metadata
  const replay = client.getIntegrationByName<
    Integration & {
      getReplayId: (onlyIfSampled?: boolean) => string;
      getRecordingMode: () => 'session' | 'buffer' | undefined;
    }
  >('Replay');

  const replayId = replay?.getReplayId(true);
  setMetricAttribute(processedMetricAttributes, 'sentry.replay_id', replayId);

  if (replayId && replay?.getRecordingMode() === 'buffer') {
    setMetricAttribute(processedMetricAttributes, 'sentry._internal.replay_is_buffering', true);
  }

  return {
    ...beforeMetric,
    attributes: processedMetricAttributes,
  };
}

/**
 * Creates a serialized metric ready to be sent to Sentry.
 */
function _buildSerializedMetric(metric: Metric, client: Client, currentScope: Scope): SerializedMetric {
  // Serialize attributes
  const serializedAttributes: Record<string, SerializedMetricAttributeValue> = {};
  for (const key in metric.attributes) {
    if (metric.attributes[key] !== undefined) {
      serializedAttributes[key] = metricAttributeToSerializedMetricAttribute(metric.attributes[key]);
    }
  }

  // Get trace context
  const [, traceContext] = _getTraceInfoFromScope(client, currentScope);
  const span = _getSpanForScope(currentScope);
  const traceId = span ? span.spanContext().traceId : traceContext?.trace_id;
  const spanId = span ? span.spanContext().spanId : undefined;

  return {
    timestamp: timestampInSeconds(),
    trace_id: traceId ?? '',
    span_id: spanId,
    name: metric.name,
    type: metric.type,
    unit: metric.unit,
    value: metric.value,
    attributes: serializedAttributes,
  };
}

/**
 * Captures a metric event and sends it to Sentry.
 *
 * @param metric - The metric event to capture.
 * @param options - Options for capturing the metric.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function _INTERNAL_captureMetric(beforeMetric: Metric, options?: InternalCaptureMetricOptions): void {
  const currentScope = options?.scope ?? getCurrentScope();
  const captureSerializedMetric = options?.captureSerializedMetric ?? _INTERNAL_captureSerializedMetric;
  const client = currentScope?.getClient() ?? getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn('No client available to capture metric.');
    return;
  }

  const { _experiments, enableMetrics, beforeSendMetric } = client.getOptions();

  // todo(v11): Remove the experimental flag
  // eslint-disable-next-line deprecation/deprecation
  const metricsEnabled = enableMetrics ?? _experiments?.enableMetrics ?? true;

  if (!metricsEnabled) {
    DEBUG_BUILD && debug.warn('metrics option not enabled, metric will not be captured.');
    return;
  }

  // Enrich metric with contextual attributes
  const enrichedMetric = _enrichMetricAttributes(beforeMetric, client, currentScope);

  // todo(v11): Remove the experimental `beforeSendMetric`
  // eslint-disable-next-line deprecation/deprecation
  const beforeSendCallback = beforeSendMetric || _experiments?.beforeSendMetric;
  const processedMetric = beforeSendCallback ? beforeSendCallback(enrichedMetric) : enrichedMetric;

  if (!processedMetric) {
    DEBUG_BUILD && debug.log('`beforeSendMetric` returned `null`, will not send metric.');
    return;
  }

  const serializedMetric = _buildSerializedMetric(processedMetric, client, currentScope);

  DEBUG_BUILD && debug.log('[Metric]', serializedMetric);

  captureSerializedMetric(client, serializedMetric);

  client.emit('afterCaptureMetric', enrichedMetric);
}

/**
 * Flushes the metrics buffer to Sentry.
 *
 * @param client - A client.
 * @param maybeMetricBuffer - A metric buffer. Uses the metric buffer for the given client if not provided.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function _INTERNAL_flushMetricsBuffer(client: Client, maybeMetricBuffer?: Array<SerializedMetric>): void {
  const metricBuffer = maybeMetricBuffer ?? _INTERNAL_getMetricBuffer(client) ?? [];
  if (metricBuffer.length === 0) {
    return;
  }

  const clientOptions = client.getOptions();
  const envelope = createMetricEnvelope(metricBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn());

  // Clear the metric buffer after envelopes have been constructed.
  _getBufferMap().set(client, []);

  client.emit('flushMetrics');

  // sendEnvelope should not throw
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  client.sendEnvelope(envelope);
}

/**
 * Returns the metric buffer for a given client.
 *
 * Exported for testing purposes.
 *
 * @param client - The client to get the metric buffer for.
 * @returns The metric buffer for the given client.
 */
export function _INTERNAL_getMetricBuffer(client: Client): Array<SerializedMetric> | undefined {
  return _getBufferMap().get(client);
}

/**
 * Get the scope data for the current scope after merging with the
 * global scope and isolation scope.
 *
 * @param currentScope - The current scope.
 * @returns The scope data.
 */
function getMergedScopeData(currentScope: Scope): ScopeData {
  const scopeData = getGlobalScope().getScopeData();
  mergeScopeData(scopeData, getIsolationScope().getScopeData());
  mergeScopeData(scopeData, currentScope.getScopeData());
  return scopeData;
}

function _getBufferMap(): WeakMap<Client, Array<SerializedMetric>> {
  // The reference to the Client <> MetricBuffer map is stored on the carrier to ensure it's always the same
  return getGlobalSingleton('clientToMetricBufferMap', () => new WeakMap<Client, Array<SerializedMetric>>());
}
