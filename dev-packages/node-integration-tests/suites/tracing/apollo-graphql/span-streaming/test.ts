import type { SerializedStreamedSpan } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// Scoped to the `Test Transaction` segment: creating the server parses the schema's typeDefs, which
// emits a parse span under `Test Server Start`.
function graphqlSpans(spans: SerializedStreamedSpan[]): SerializedStreamedSpan[] {
  return spans.filter(
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
    test('records graphql span names, processing types, and segment operations', async () => {
      const runner = createTestRunner();
      const spansPromise = runner.collectStreamedSpans(
        spans =>
          spans.some(span => span.is_segment && span.name === 'Test Transaction') && graphqlSpans(spans).length >= 8,
      );

      await runner.start().completed();

      const traceSpans = await spansPromise;
      const spans = graphqlSpans(traceSpans);

      const executeSpans = spans.filter(span => span.attributes['graphql.operation.type']);
      expect(executeSpans.map(span => span.name)).toEqual(['GraphQL query', 'GraphQL mutation']);

      // Resolver spans keep the field path as an attribute, but it is unbounded, so it must not
      // reach the span name.
      const resolveSpans = spans.filter(span => span.attributes['graphql.field.path']);
      expect(resolveSpans.map(span => span.attributes['graphql.field.path']?.value)).toEqual(['hello', 'login']);
      expect(resolveSpans.map(span => span.name)).toEqual(['GraphQL resolve', 'GraphQL resolve']);

      // Parse and validate spans have no operation type, so they are named after the phase.
      const phaseSpans = spans.filter(span => !executeSpans.includes(span) && !resolveSpans.includes(span));
      expect(phaseSpans.length).toBeGreaterThan(0);
      expect(phaseSpans.every(span => ['GraphQL parse', 'GraphQL validate'].includes(span.name))).toBe(true);

      expect(spans.some(span => span.name.includes('GetHello') || span.name.includes('TestMutation'))).toBe(false);

      const processingTypes = spans.map(span => span.attributes['graphql.processing.type']?.value);

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

      // `Test Server Start` is a segment too, so pick the one the operations ran under.
      const segmentSpan = traceSpans.find(item => item.is_segment && item.name === 'Test Transaction');

      expect(segmentSpan).toBeDefined();
      // Both operations are recorded here rather than in the name.
      expect(segmentSpan?.attributes['sentry.graphql.operation']?.value).toEqual([
        'query GetHello',
        'mutation TestMutation',
      ]);
    });
  });
});
