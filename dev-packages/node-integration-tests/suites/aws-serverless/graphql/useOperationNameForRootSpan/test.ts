import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const EXPECTED_TRANSCATION = {
  transaction: 'Test Transaction (query GetHello)',
  spans: expect.arrayContaining([
    expect.objectContaining({
      description: 'query GetHello',
      origin: 'auto.graphql.otel.graphql',
      status: 'ok',
    }),
  ]),
};

describe('graphqlIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should use GraphQL operation name for root span if useOperationNameForRootSpan is set', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({ transaction: { transaction: 'Test Server Start (query IntrospectionQuery)' } })
      .expect({ transaction: EXPECTED_TRANSCATION })
      .start()
      .completed();
  });
});
