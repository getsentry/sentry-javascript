import type { Span } from '@sentry/core';
import {
  debug,
  dynamicSamplingContextToSentryBaggageHeader,
  getDynamicSamplingContextFromSpan,
  spanToTraceHeader,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../../debug-build';
import type { SNS, SQS } from '../aws-sdk.types';

// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-quotas.html
export const MAX_MESSAGE_ATTRIBUTES = 10;

// Sentry trace-propagation headers written into / read from AWS message attributes.
const SENTRY_TRACE_HEADER = 'sentry-trace';
const BAGGAGE_HEADER = 'baggage';
const PROPAGATION_FIELDS = [SENTRY_TRACE_HEADER, BAGGAGE_HEADER];

export interface AwsSdkContextObject {
  [key: string]: {
    StringValue?: string;
    Value?: string;
  };
}

/** Build the `sentry-trace`/`baggage` header pair carrying the span's trace context. */
export function getPropagationHeaders(span: Span): Record<string, string> {
  const headers: Record<string, string> = {
    [SENTRY_TRACE_HEADER]: spanToTraceHeader(span),
  };
  const baggage = dynamicSamplingContextToSentryBaggageHeader(getDynamicSamplingContextFromSpan(span));
  if (baggage) {
    headers[BAGGAGE_HEADER] = baggage;
  }
  return headers;
}

/**
 * Inject the span's trace-propagation headers into an SQS/SNS message-attribute map, so the consumer
 * can continue the trace. Respects the SQS 10-attribute quota. Mirrors the OTel integration's
 * `injectPropagationContext`, but writes Sentry's `sentry-trace`/`baggage` instead of W3C headers.
 */
export function injectPropagationContext(
  attributesMap: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap | undefined,
  span: Span,
): SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap {
  const attributes = attributesMap ?? {};
  const headers = getPropagationHeaders(span);
  const headerKeys = Object.keys(headers);

  if (Object.keys(attributes).length + headerKeys.length <= MAX_MESSAGE_ATTRIBUTES) {
    for (const key of headerKeys) {
      (attributes as AwsSdkContextObject)[key] = { DataType: 'String', StringValue: headers[key] } as any;
    }
  } else {
    DEBUG_BUILD &&
      debug.warn(
        '[orchestrion:aws-sdk] cannot set trace propagation on SQS/SNS message due to maximum amount of MessageAttributes',
      );
  }
  return attributes;
}

/** Read the propagation headers back off a received SQS message, if present. */
export function extractPropagationHeaders(
  message: SQS.Message,
): { sentryTrace?: string; baggage?: string } | undefined {
  const carrier = (message.MessageAttributes ?? {}) as AwsSdkContextObject;
  const sentryTrace = carrier[SENTRY_TRACE_HEADER]?.StringValue ?? carrier[SENTRY_TRACE_HEADER]?.Value;
  if (!sentryTrace) {
    return undefined;
  }
  return {
    sentryTrace,
    baggage: carrier[BAGGAGE_HEADER]?.StringValue ?? carrier[BAGGAGE_HEADER]?.Value,
  };
}

export function addPropagationFieldsToAttributeNames(messageAttributeNames: string[] = []): string[] {
  return messageAttributeNames.length
    ? Array.from(new Set([...messageAttributeNames, ...PROPAGATION_FIELDS]))
    : [...PROPAGATION_FIELDS];
}
