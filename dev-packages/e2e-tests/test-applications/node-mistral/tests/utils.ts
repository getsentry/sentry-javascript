import { expect } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp } from '@sentry-internal/test-utils';

export const APP = 'node-mistral';

export const attr = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

export const isChatSpan = (span: SerializedStreamedSpan): boolean => getSpanOp(span) === 'gen_ai.chat';

/** A readable span tree, used as a failure message so a broken assertion is diagnosable. */
export function describeTree(spans: SerializedStreamedSpan[]): string {
  return spans
    .map(span => `${span.name} [${getSpanOp(span) ?? '-'}] id=${span.span_id} parent=${span.parent_span_id ?? '-'}`)
    .join('\n');
}

/** Walk to the trace root, so assertions can allow auto-instrumented spans in between. */
export function ancestorIds(spans: SerializedStreamedSpan[], span: SerializedStreamedSpan): string[] {
  const byId = new Map(spans.map(candidate => [candidate.span_id, candidate]));
  const ids: string[] = [];

  let current: SerializedStreamedSpan | undefined = span;
  while (current?.parent_span_id) {
    ids.push(current.parent_span_id);
    current = byId.get(current.parent_span_id);
  }

  return ids;
}

export function byName(spans: SerializedStreamedSpan[], name: string): SerializedStreamedSpan {
  const span = spans.find(candidate => candidate.name === name);
  expect(span, `expected a span named "${name}" in:\n${describeTree(spans)}`).toBeDefined();
  return span!;
}

/**
 * Attributes every successful gen_ai span carries, whatever the model happens to answer. Values that
 * depend on the model (token counts, response text) are checked for shape and not for content.
 */
export function expectCommonChatAttributes(span: SerializedStreamedSpan): void {
  expect(attr(span, 'sentry.origin')).toBe('auto.ai.mistralai');
  expect(attr(span, 'gen_ai.provider.name')).toBe('mistralai');
  expect(attr(span, 'gen_ai.operation.name')).toBe('chat');
  expect(span.name).toBe(`chat ${attr(span, 'gen_ai.request.model')}`);
  expect(span.status).toBe('ok');

  expect(typeof attr(span, 'gen_ai.response.model')).toBe('string');
  expect(attr(span, 'gen_ai.usage.input_tokens')).toBeGreaterThan(0);
  expect(attr(span, 'gen_ai.usage.output_tokens')).toBeGreaterThan(0);
  expect(attr(span, 'gen_ai.usage.total_tokens')).toBeGreaterThan(0);
}
