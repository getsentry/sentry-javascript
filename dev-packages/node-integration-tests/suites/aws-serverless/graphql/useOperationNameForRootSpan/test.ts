import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const EXPECTED_TRANSCATION = {
  transaction: 'Test Server Start (query GetHello)',
  spans: expect.arrayContaining([
    expect.objectContaining({
      description: 'query GetHello',
      origin: 'auto.graphql.otel.graphql',
      data: expect.objectContaining({
        data: {
          'graphql.operation.name': 'GetHello',
          'graphql.operation.type': 'query',
          'graphql.source': 'query GetHello {hello}',
          'sentry.origin': 'auto.graphql.otel.graphql',
        },
        description: 'query GetHello',
        status: 'ok',
        origin: 'auto.graphql.otel.graphql',
      }),
    }),
  ]),
};

describe('graphqlIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should use GraphQL operation name for root span if option is set', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({ transaction: EXPECTED_TRANSCATION })
      .start()
      .completed();
  });
});
