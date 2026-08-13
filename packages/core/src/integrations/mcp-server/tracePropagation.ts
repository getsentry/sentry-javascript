import type { SpanContextData } from '../../types/span';
import { MAX_BAGGAGE_STRING_LENGTH } from '../../utils/baggage';
import { isPlainObject } from '../../utils/is';

const ZERO_TRACE_ID = '00000000000000000000000000000000';
const ZERO_SPAN_ID = '0000000000000000';
const MAX_TRACEPARENT_LENGTH = 512;
const MAX_TRACESTATE_LENGTH = 512;
const W3C_TRACEPARENT_REGEXP = /^\s?((?!ff)[0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?\s?$/;

/** Trace propagation values extracted from an MCP request's `params._meta`. */
export interface McpTraceContext {
  /** The original W3C traceparent value. */
  traceparent: string;
  /** The traceparent converted to the format accepted by `continueTrace`. */
  sentryTrace: string;
  /** W3C baggage, passed through for Sentry dynamic sampling context extraction. */
  baggage?: string;
  /** W3C tracestate, preserved for callers which support it. */
  tracestate?: string;
  /** The remote parent context, suitable for use in a span link. */
  parentContext: SpanContextData;
}

/**
 * Extracts the W3C trace context carried in an MCP request's `params._meta`.
 *
 * Sentry's `continueTrace` consumes the Sentry trace header format, so a valid
 * W3C traceparent is converted while its original parent context is retained.
 */
export function extractMcpTraceContext(params: unknown): McpTraceContext | undefined {
  if (!isPlainObject(params) || !isPlainObject(params._meta)) {
    return undefined;
  }

  const { traceparent, baggage, tracestate } = params._meta;
  const parsedTraceparent = parseW3CTraceparent(traceparent);

  if (!parsedTraceparent) {
    return undefined;
  }

  const { traceId, parentSpanId, sampled } = parsedTraceparent;

  return {
    traceparent: parsedTraceparent.traceparent,
    sentryTrace: `${traceId}-${parentSpanId}-${sampled ? '1' : '0'}`,
    ...(isValidOptionalPropagationField(baggage, MAX_BAGGAGE_STRING_LENGTH) ? { baggage } : {}),
    ...(isValidOptionalPropagationField(tracestate, MAX_TRACESTATE_LENGTH) ? { tracestate } : {}),
    parentContext: {
      traceId,
      spanId: parentSpanId,
      isRemote: true,
      traceFlags: sampled ? 1 : 0,
    },
  };
}

function parseW3CTraceparent(
  traceparent: unknown,
): { traceparent: string; traceId: string; parentSpanId: string; sampled: boolean } | undefined {
  if (typeof traceparent !== 'string' || traceparent.length > MAX_TRACEPARENT_LENGTH) {
    return undefined;
  }

  const match = W3C_TRACEPARENT_REGEXP.exec(traceparent);
  if (!match) {
    return undefined;
  }

  const version = match[1];
  const traceId = match[2];
  const parentSpanId = match[3];
  const flags = match[4];
  const extraFields = match[5];

  if (
    !version ||
    !traceId ||
    !parentSpanId ||
    !flags ||
    traceId === ZERO_TRACE_ID ||
    parentSpanId === ZERO_SPAN_ID ||
    (version === '00' && extraFields)
  ) {
    return undefined;
  }

  return { traceparent, traceId, parentSpanId, sampled: Number.parseInt(flags, 16) % 2 === 1 };
}

function isValidOptionalPropagationField(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}
