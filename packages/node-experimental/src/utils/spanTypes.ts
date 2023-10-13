import type { SpanKind } from '@opentelemetry/api';
import type { ReadableSpan, TimedEvent } from '@opentelemetry/sdk-trace-base';
import { Span as SdkTraceBaseSpan } from '@opentelemetry/sdk-trace-base';

import type { AbstractSpan } from '../types';

/**
 * Check if a given span has attributes.
 * This is necessary because the base `Span` type does not have attributes,
 * so in places where we are passed a generic span, we need to check if we want to access them.
 */
export function spanHasAttributes<SpanType extends AbstractSpan>(
  span: SpanType,
): span is SpanType & { attributes: ReadableSpan['attributes'] } {
  const castSpan = span as ReadableSpan;
  return !!castSpan.attributes && typeof castSpan.attributes === 'object';
}

/**
 * Check if a given span has a kind.
 * This is necessary because the base `Span` type does not have a kind,
 * so in places where we are passed a generic span, we need to check if we want to access it.
 */
export function spanHasKind<SpanType extends AbstractSpan>(span: SpanType): span is SpanType & { kind: SpanKind } {
  const castSpan = span as ReadableSpan;
  return !!castSpan.kind;
}

/**
 * Check if a given span has a kind.
 * This is necessary because the base `Span` type does not have a kind,
 * so in places where we are passed a generic span, we need to check if we want to access it.
 */
export function spanHasParentId<SpanType extends AbstractSpan>(
  span: SpanType,
): span is SpanType & { parentSpanId: string } {
  const castSpan = span as ReadableSpan;
  return !!castSpan.parentSpanId;
}

/**
 * Check if a given span has events.
 * This is necessary because the base `Span` type does not have events,
 * so in places where we are passed a generic span, we need to check if we want to access it.
 */
export function spanHasEvents<SpanType extends AbstractSpan>(
  span: SpanType,
): span is SpanType & { events: TimedEvent[] } {
  const castSpan = span as ReadableSpan;
  return Array.isArray(castSpan.events);
}

/**
 * If the span is a SDK trace base span, which has some additional fields.
 */
export function spanIsSdkTraceBaseSpan(span: AbstractSpan): span is SdkTraceBaseSpan {
  return span instanceof SdkTraceBaseSpan;
}
