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
          expect(allSpans).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'Test Server Start', is_segment: true })]),
          );
          expect(segment.attributes['sentry.graphql.operation']?.value).toBe('query GetHello');
          expect(children).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'GraphQL query',
                status: 'ok',
                attributes: expect.objectContaining({
                  'graphql.operation.name': { value: 'GetHello', type: 'string' },
                  'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
                }),
              }),
            ]),
          );
        }),
      })
      .start()
      .completed();
  });
});
