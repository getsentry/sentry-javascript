import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

type StreamedSpan = SerializedStreamedSpanContainer['items'][number];

// Scoped to the `Test Transaction` segment: creating the server parses the schema's typeDefs, which
// emits a parse span under `Test Server Start`.
function graphqlSpans(container: SerializedStreamedSpanContainer): StreamedSpan[] {
  return container.items.filter(
    item =>
      item.attributes['sentry.op']?.value === 'graphql' &&
      item.attributes['sentry.segment.name']?.value === 'Test Transaction',
  );
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

            // Parse, validate and resolve spans have no operation type to name them after.
            const fallbackSpans = spans.filter(span => !executeSpans.includes(span));
            expect(fallbackSpans.every(span => span.name === 'GraphQL Operation')).toBe(true);

            expect(spans.some(span => span.name.includes('GetHello') || span.name.includes('TestMutation'))).toBe(
              false,
            );
          },
        })
        .start()
        .completed();
    });

    test('marks every graphql span with its processing type', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const processingTypes = graphqlSpans(container).map(
              span => span.attributes['graphql.processing.type']?.value,
            );

            expect(processingTypes.sort()).toEqual([
              'execute',
              'execute',
              'parse',
              'parse',
              'resolve',
              'resolve',
              'validate',
              'validate',
            ]);
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
