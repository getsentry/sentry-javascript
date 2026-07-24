import type { SpanStatus } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { AbstractSpan } from '../types';
import { isObjectLike } from '@sentry/core';

/**
 * Check if a given span has attributes.
 * This is necessary because the base `Span` type does not have attributes,
 * so in places where we are passed a generic span, we need to check if we want to access them.
 */
export function spanHasAttributes<SpanType extends AbstractSpan>(
  span: SpanType,
): span is SpanType & { attributes: ReadableSpan['attributes'] } {
  const castSpan = span as ReadableSpan;
  return isObjectLike(castSpan.attributes);
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
