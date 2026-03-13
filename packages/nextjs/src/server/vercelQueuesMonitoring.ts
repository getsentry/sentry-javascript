import type { Span } from '@sentry/core';
import { getIsolationScope, spanToJSON } from '@sentry/core';

// OTel Messaging semantic convention attribute keys
const ATTR_MESSAGING_SYSTEM = 'messaging.system';
const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';
const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id';
const ATTR_MESSAGING_OPERATION_NAME = 'messaging.operation.name';
const ATTR_MESSAGING_CONSUMER_GROUP_NAME = 'messaging.consumer.group.name';
const ATTR_MESSAGING_MESSAGE_DELIVERY_COUNT = 'messaging.message.delivery_count';

// Marker attribute to track enriched spans for cleanup
const ATTR_SENTRY_QUEUE_ENRICHED = 'sentry.queue.enriched';

/**
 * Checks if the incoming request is a Vercel Queue consumer callback (push mode)
 * and enriches the http.server span with OTel messaging semantic attributes.
 *
 * Vercel Queues push delivery sends a CloudEvent POST with the header:
 *   ce-type: com.vercel.queue.v2beta
 * along with ce-vqs* headers carrying queue metadata.
 */
export function maybeEnrichQueueConsumerSpan(span: Span): void {
  const headers = getIsolationScope().getScopeData().sdkProcessingMetadata?.normalizedRequest?.headers as
    | Record<string, string | string[] | undefined>
    | undefined;

  if (!headers) {
    return;
  }

  const ceType = Array.isArray(headers['ce-type']) ? headers['ce-type'][0] : headers['ce-type'];
  if (ceType !== 'com.vercel.queue.v2beta') {
    return;
  }

  const queueName = getHeader(headers, 'ce-vqsqueuename');
  const messageId = getHeader(headers, 'ce-vqsmessageid');
  const consumerGroup = getHeader(headers, 'ce-vqsconsumergroup');
  const deliveryCount = getHeader(headers, 'ce-vqsdeliverycount');

  span.setAttribute(ATTR_MESSAGING_SYSTEM, 'vercel.queue');
  span.setAttribute(ATTR_MESSAGING_OPERATION_NAME, 'process');

  if (queueName) {
    span.setAttribute(ATTR_MESSAGING_DESTINATION_NAME, queueName);
  }

  if (messageId) {
    span.setAttribute(ATTR_MESSAGING_MESSAGE_ID, messageId);
  }

  if (consumerGroup) {
    span.setAttribute(ATTR_MESSAGING_CONSUMER_GROUP_NAME, consumerGroup);
  }

  if (deliveryCount) {
    const count = parseInt(deliveryCount, 10);
    if (!isNaN(count)) {
      span.setAttribute(ATTR_MESSAGING_MESSAGE_DELIVERY_COUNT, count);
    }
  }

  // Mark span so we can clean up marker on spanEnd
  span.setAttribute(ATTR_SENTRY_QUEUE_ENRICHED, true);
}

/**
 * Checks if an outgoing http.client span targets the Vercel Queues API
 * and enriches it with OTel messaging semantic attributes (producer side).
 *
 * The Vercel Queues API lives at *.vercel-queue.com/api/v3/topic/<topic>.
 * We use domain-based detection to avoid false positives from user routes.
 */
export function maybeEnrichQueueProducerSpan(span: Span): void {
  const spanData = spanToJSON(span).data;

  // http.client spans have url.full attribute
  const urlFull = spanData?.['url.full'] as string | undefined;
  if (!urlFull) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlFull);
  } catch {
    return;
  }

  if (!parsed.hostname.endsWith('vercel-queue.com')) {
    return;
  }

  // Extract topic from path: /api/v3/topic/<topic>[/<messageId>]
  const topicMatch = parsed.pathname.match(/^\/api\/v3\/topic\/([^/]+)/);
  if (!topicMatch) {
    return;
  }

  const topic = decodeURIComponent(topicMatch[1]!);

  span.setAttribute(ATTR_MESSAGING_SYSTEM, 'vercel.queue');
  span.setAttribute(ATTR_MESSAGING_DESTINATION_NAME, topic);
  span.setAttribute(ATTR_MESSAGING_OPERATION_NAME, 'send');

  // Mark span so we can clean up marker on spanEnd
  span.setAttribute(ATTR_SENTRY_QUEUE_ENRICHED, true);
}

/**
 * Cleans up the internal marker attribute from enriched queue spans on end.
 */
export function maybeCleanupQueueSpan(span: Span): void {
  const spanData = spanToJSON(span).data;
  if (spanData?.[ATTR_SENTRY_QUEUE_ENRICHED]) {
    span.setAttribute(ATTR_SENTRY_QUEUE_ENRICHED, undefined);
  }
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
