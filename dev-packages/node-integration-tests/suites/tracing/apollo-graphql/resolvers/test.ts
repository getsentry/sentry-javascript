import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('GraphQL/Apollo Tests > resolve spans', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // With `ignoreResolveSpans: false`, the instrumentation emits a span for the execute step as well as
  // for `parse`, `validate` and each (non-trivial) field resolver.

  createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('emits parse, validate and resolve spans when ignoreResolveSpans is false', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
            const segment = container.items.find(span => span.is_segment && span.name === 'Test Transaction');
            const children = container.items.filter(
              span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
            );

            expect(segment?.attributes['sentry.graphql.operation']).toEqual({ value: 'query', type: 'string' });
            const executeSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'execute');
            expect(executeSpan?.name).toBe('GraphQL query');
            expect(executeSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
            expect(executeSpan?.attributes['graphql.processing.type']).toEqual({ value: 'execute', type: 'string' });
            expect(executeSpan?.attributes['graphql.document']).toEqual({ value: '{hello}', type: 'string' });
            expect(executeSpan?.attributes['sentry.origin']).toEqual({
              value: 'auto.graphql.diagnostic_channel',
              type: 'string',
            });
            const parseSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'parse');
            expect(parseSpan?.name).toBe('GraphQL parse');
            expect(parseSpan?.attributes['graphql.processing.type']).toEqual({ value: 'parse', type: 'string' });
            const validateSpan = children.find(
              span => span.attributes['graphql.processing.type']?.value === 'validate',
            );
            expect(validateSpan?.name).toBe('GraphQL validate');
            expect(validateSpan?.attributes['graphql.processing.type']).toEqual({ value: 'validate', type: 'string' });
            const helloResolverSpan = children.find(
              span =>
                span.attributes['graphql.processing.type']?.value === 'resolve' &&
                span.attributes['graphql.field.path']?.value === 'hello',
            );
            expect(helloResolverSpan?.name).toBe('GraphQL resolve');
            expect(helloResolverSpan?.attributes['graphql.processing.type']).toEqual({
              value: 'resolve',
              type: 'string',
            });
            expect(helloResolverSpan?.attributes['graphql.field.name']).toEqual({ value: 'hello', type: 'string' });
            expect(helloResolverSpan?.attributes['graphql.field.path']).toEqual({ value: 'hello', type: 'string' });
            expect(helloResolverSpan?.attributes['graphql.field.type']).toEqual({ value: 'String', type: 'string' });
            expect(helloResolverSpan?.attributes['graphql.parent.name']).toEqual({ value: 'Query', type: 'string' });
          },
        })
        .start()
        .completed();
    });
  });

  // Same behavior on the diagnostics-channel path: passing the channel integration explicitly (see
  // instrument-dc.mjs) must carry `ignoreResolveSpans: false` through — the explicit instance wins over
  // the swapped-in default — and emit resolve spans with the orchestrion origin.

  createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument-dc.mjs', (createTestRunner, test) => {
    test('emits resolve spans via diagnostics-channel injection when configured explicitly', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
            const segment = container.items.find(span => span.is_segment && span.name === 'Test Transaction');
            const children = container.items.filter(
              span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
            );

            expect(segment?.attributes['sentry.graphql.operation']).toEqual({ value: 'query', type: 'string' });
            const executeSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'execute');
            expect(executeSpan?.name).toBe('GraphQL query');
            expect(executeSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
            expect(executeSpan?.attributes['graphql.processing.type']).toEqual({ value: 'execute', type: 'string' });
            expect(executeSpan?.attributes['graphql.document']).toEqual({ value: '{hello}', type: 'string' });
            expect(executeSpan?.attributes['sentry.origin']).toEqual({
              value: 'auto.graphql.diagnostic_channel',
              type: 'string',
            });
            const parseSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'parse');
            expect(parseSpan?.name).toBe('GraphQL parse');
            expect(parseSpan?.attributes['graphql.processing.type']).toEqual({ value: 'parse', type: 'string' });
            const validateSpan = children.find(
              span => span.attributes['graphql.processing.type']?.value === 'validate',
            );
            expect(validateSpan?.name).toBe('GraphQL validate');
            expect(validateSpan?.attributes['graphql.processing.type']).toEqual({ value: 'validate', type: 'string' });
            const helloResolverSpan = children.find(
              span =>
                span.attributes['graphql.processing.type']?.value === 'resolve' &&
                span.attributes['graphql.field.path']?.value === 'hello',
            );
            expect(helloResolverSpan?.name).toBe('GraphQL resolve');
            expect(helloResolverSpan?.attributes['graphql.processing.type']).toEqual({
              value: 'resolve',
              type: 'string',
            });
            expect(helloResolverSpan?.attributes['graphql.field.name']).toEqual({ value: 'hello', type: 'string' });
            expect(helloResolverSpan?.attributes['graphql.field.path']).toEqual({ value: 'hello', type: 'string' });
            expect(helloResolverSpan?.attributes['graphql.field.type']).toEqual({ value: 'String', type: 'string' });
            expect(helloResolverSpan?.attributes['graphql.parent.name']).toEqual({ value: 'Query', type: 'string' });
          },
        })
        .start()
        .completed();
    });
  });
});
