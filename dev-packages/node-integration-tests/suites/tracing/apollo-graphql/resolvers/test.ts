import { afterAll, describe, expect } from 'vitest';
import { expectGraphqlTrace } from '../../graphql-test-utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// Apollo Server v5 no longer runs an introspection query on start.
const EXPECTED_START_SERVER_SPAN = {
  name: 'Test Server Start',
  is_segment: true,
};

describe('GraphQL/Apollo Tests > resolve spans', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // With `ignoreResolveSpans: false`, the instrumentation emits a span for the execute step as well as
  // for `parse`, `validate` and each (non-trivial) field resolver.
  const EXPECTED_TRACE = {
    segment: {
      name: 'Test Transaction',
      attributes: { 'sentry.graphql.operation': { value: 'query', type: 'string' } },
    },
    children: expect.arrayContaining([
      expect.objectContaining({
        name: 'GraphQL query',
        attributes: expect.objectContaining({
          'graphql.operation.type': { value: 'query', type: 'string' },
          'graphql.processing.type': { value: 'execute', type: 'string' },
          'graphql.document': { value: '{hello}', type: 'string' },
          'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
        }),
      }),
      expect.objectContaining({
        name: 'GraphQL parse',
        attributes: expect.objectContaining({ 'graphql.processing.type': { value: 'parse', type: 'string' } }),
      }),
      expect.objectContaining({
        name: 'GraphQL validate',
        attributes: expect.objectContaining({ 'graphql.processing.type': { value: 'validate', type: 'string' } }),
      }),
      expect.objectContaining({
        name: 'GraphQL resolve',
        attributes: expect.objectContaining({
          'graphql.processing.type': { value: 'resolve', type: 'string' },
          'graphql.field.name': { value: 'hello', type: 'string' },
          'graphql.field.path': { value: 'hello', type: 'string' },
          'graphql.field.type': { value: 'String', type: 'string' },
          'graphql.parent.name': { value: 'Query', type: 'string' },
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('emits parse, validate and resolve spans when ignoreResolveSpans is false', async () => {
      await createTestRunner()
        .unordered()
        .expect({
          span: expectGraphqlTrace('Test Transaction', (segment, children, allSpans) => {
            expect(allSpans).toEqual(expect.arrayContaining([expect.objectContaining(EXPECTED_START_SERVER_SPAN)]));
            expect({ segment, children }).toMatchObject(EXPECTED_TRACE);
          }),
        })
        .start()
        .completed();
    });
  });

  // Same behavior on the diagnostics-channel path: passing the channel integration explicitly (see
  // instrument-dc.mjs) must carry `ignoreResolveSpans: false` through — the explicit instance wins over
  // the swapped-in default — and emit resolve spans with the orchestrion origin.
  const EXPECTED_ORCHESTRION_TRACE = {
    segment: {
      name: 'Test Transaction',
      attributes: { 'sentry.graphql.operation': { value: 'query', type: 'string' } },
    },
    children: expect.arrayContaining([
      expect.objectContaining({
        name: 'GraphQL query',
        attributes: expect.objectContaining({
          'graphql.operation.type': { value: 'query', type: 'string' },
          'graphql.processing.type': { value: 'execute', type: 'string' },
          'graphql.document': { value: '{hello}', type: 'string' },
          'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
        }),
      }),
      expect.objectContaining({
        name: 'GraphQL parse',
        attributes: expect.objectContaining({ 'graphql.processing.type': { value: 'parse', type: 'string' } }),
      }),
      expect.objectContaining({
        name: 'GraphQL validate',
        attributes: expect.objectContaining({ 'graphql.processing.type': { value: 'validate', type: 'string' } }),
      }),
      expect.objectContaining({
        name: 'GraphQL resolve',
        attributes: expect.objectContaining({
          'graphql.processing.type': { value: 'resolve', type: 'string' },
          'graphql.field.name': { value: 'hello', type: 'string' },
          'graphql.field.path': { value: 'hello', type: 'string' },
          'graphql.field.type': { value: 'String', type: 'string' },
          'graphql.parent.name': { value: 'Query', type: 'string' },
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument-dc.mjs', (createTestRunner, test) => {
    test('emits resolve spans via diagnostics-channel injection when configured explicitly', async () => {
      await createTestRunner()
        .unordered()
        .expect({
          span: expectGraphqlTrace('Test Transaction', (segment, children, allSpans) => {
            expect(allSpans).toEqual(expect.arrayContaining([expect.objectContaining(EXPECTED_START_SERVER_SPAN)]));
            expect({ segment, children }).toMatchObject(EXPECTED_ORCHESTRION_TRACE);
          }),
        })
        .start()
        .completed();
    });
  });
});
