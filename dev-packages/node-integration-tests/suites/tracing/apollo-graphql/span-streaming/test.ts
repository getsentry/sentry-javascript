import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

type StreamedSpan = SerializedStreamedSpanContainer['items'][number];

function graphqlSpans(container: SerializedStreamedSpanContainer): StreamedSpan[] {
  return container.items.filter(item => item.attributes['sentry.op']?.value === 'graphql');
}

describe('GraphQL/Apollo Tests > span streaming', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('names graphql spans after the operation type, never the operation name or field path', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const spans = graphqlSpans(container);

            const executeSpans = spans.filter(span => span.attributes['graphql.operation.type']);
            expect(executeSpans.map(span => span.name)).toEqual(['GraphQL query', 'GraphQL mutation']);

            // Resolver spans keep the field path as an attribute, but it is unbounded, so it must not
            // reach the span name.
            const resolveSpans = spans.filter(span => span.attributes['graphql.field.path']);
            expect(resolveSpans.map(span => span.attributes['graphql.field.path']?.value)).toEqual(['hello', 'login']);
            expect(resolveSpans.map(span => span.name)).toEqual(['GraphQL resolve', 'GraphQL resolve']);

            // Parse and validate spans have no operation type, so they are named after the phase.
            const otherSpans = spans.filter(span => !executeSpans.includes(span) && !resolveSpans.includes(span));
            expect(otherSpans.length).toBeGreaterThan(0);
            expect(otherSpans.every(span => ['GraphQL parse', 'GraphQL validate'].includes(span.name))).toBe(true);

            expect(spans.some(span => span.name.includes('GetHello') || span.name.includes('TestMutation'))).toBe(
              false,
            );
          },
        })
        .start()
        .completed();
    });

    test('records the operations on the segment span without renaming it', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            // `Test Server Start` is a segment too, so pick the one the operations ran under.
            const segmentSpan = container.items.find(item => item.is_segment && item.name === 'Test Transaction');

            expect(segmentSpan).toBeDefined();
            expect(segmentSpan?.attributes['sentry.graphql.operation']).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });
});
