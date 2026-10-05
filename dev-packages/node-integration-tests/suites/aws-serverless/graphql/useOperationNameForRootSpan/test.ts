import { afterAll, describe, expect, test } from 'vitest';
import { expectGraphqlTrace } from '../../../tracing/graphql-test-utils';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('graphqlIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should use GraphQL operation name for root span if useOperationNameForRootSpan is set', async () => {
    await createRunner(__dirname, 'scenario.js')
      .unordered()
      .expect({
        span: expectGraphqlTrace('Test Transaction', (segment, children, allSpans) => {
          expect(allSpans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
          expect(segment.attributes['sentry.graphql.operation']).toEqual({
            value: 'query GetHello',
            type: 'string',
          });
          const executeSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'execute');
          expect(executeSpan).toBeDefined();
          expect(executeSpan?.name).toBe('GraphQL query');
          expect(executeSpan?.status).toBe('ok');
          expect(executeSpan?.attributes['graphql.operation.name']).toEqual({
            value: 'GetHello',
            type: 'string',
          });
          expect(executeSpan?.attributes['sentry.origin']).toEqual({
            value: 'auto.graphql.diagnostic_channel',
            type: 'string',
          });
        }),
      })
      .start()
      .completed();
  });
});
