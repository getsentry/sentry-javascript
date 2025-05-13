import type { SpanKind, SpanStatus } from '@opentelemetry/api';
import type { ReadableSpan, TimedEvent } from '@opentelemetry/sdk-trace-base';
import type { AbstractSpan } from '../types';
import { getParentSpanId } from './getParentSpanId';

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
  return typeof castSpan.kind === 'number';
}

/**
 * Check if a given span has a status.
 * This is necessary because the base `Span` type does not have a status,
 * so in places where we are passed a generic span, we need to check if we want to access it.
 */
export function spanHasStatus<SpanType extends AbstractSpan>(
  span: SpanType,
): span is SpanType & { status: SpanStatus } {
  const castSpan = span as ReadableSpan;
  return !!castSpan.status;
}

/**
 * Check if a given span has a name.
 * This is necessary because the base `Span` type does not have a name,
 * so in places where we are passed a generic span, we need to check if we want to access it.
 */
export function spanHasName<SpanType extends AbstractSpan>(span: SpanType): span is SpanType & { name: string } {
  const castSpan = span as ReadableSpan;
  return !!castSpan.name;
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
  return !!getParentSpanId(castSpan);
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
