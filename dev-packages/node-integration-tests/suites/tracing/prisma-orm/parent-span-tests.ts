import { DB_QUERY_TEXT, DB_STATEMENT, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { SerializedStreamedSpan } from '@sentry/core';
import { expect } from 'vitest';
import type { createEsmAndCjsTests } from '../../../utils/runner';

function queryText(span: SerializedStreamedSpan): unknown {
  return span.attributes[DB_QUERY_TEXT]?.value ?? span.attributes[DB_STATEMENT]?.value;
}

export const parentSpanTests: Parameters<typeof createEsmAndCjsTests>[3] = (createRunner, test) => {
  test('only instruments operations with an active parent span', { timeout: 75_000 }, async () => {
    const runner = createRunner();
    const prismaSpans = new Map<string, SerializedStreamedSpan>();
    const spansPromise = runner.collectStreamedSpans(spans => {
      for (const span of spans) {
        if (span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.prisma') {
          prismaSpans.set(span.span_id, span);
        }
      }
      return (
        spans.some(span => span.is_segment && span.name === 'parent operation') &&
        spans.some(span => {
          const query = queryText(span);
          return typeof query === 'string' && query.includes('inside_parent');
        })
      );
    });

    await runner.unordered().start().completed();

    const collected = await spansPromise;
    const parent = collected.find(span => span.is_segment && span.name === 'parent operation');
    const spans = [...prismaSpans.values()];
    const operations = spans.filter(span => span.name === 'prisma:client:operation');
    const validParents = new Set([parent?.span_id, ...spans.map(span => span.span_id)]);

    expect(parent).toBeDefined();
    expect(operations.map(span => span.parent_span_id)).toEqual([parent?.span_id]);
    expect(spans.filter(span => span.is_segment)).toEqual([]);
    expect(spans.every(span => validParents.has(span.parent_span_id))).toBe(true);
    expect(spans.map(queryText).filter(query => typeof query === 'string')).toEqual([
      expect.stringContaining('inside_parent'),
    ]);
  });
};
