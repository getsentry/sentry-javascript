import { afterAll, describe, expect } from 'vitest';
import { expectGraphqlTrace } from '../../graphql-test-utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// Apollo Server v5 no longer runs an introspection query on start.
const EXPECTED_START_SERVER_SPAN = {
  name: 'Test Server Start',
  is_segment: true,
};

describe('GraphQL/Apollo Tests > useOperationNameForRootSpan', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('single query operation', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'test span name',
        attributes: { 'sentry.graphql.operation': { value: 'query GetHello', type: 'string' } },
      },
      children: expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'graphql.operation.name': { value: 'GetHello', type: 'string' },
            'graphql.operation.type': { value: 'query', type: 'string' },
            'graphql.document': { value: 'query GetHello {hello}', type: 'string' },
            'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
            'sentry.op': { value: 'graphql', type: 'string' },
            'graphql.processing.type': { value: 'execute', type: 'string' },
          }),
          name: 'GraphQL query',
          status: 'ok',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single query operation', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('test span name', (segment, children, allSpans) => {
              expect(allSpans).toEqual(expect.arrayContaining([expect.objectContaining(EXPECTED_START_SERVER_SPAN)]));
              expect({ segment, children }).toMatchObject(EXPECTED_TRACE);
            }),
          })
          .start()
          .completed();
      });
    });
  });

  describe('single mutation operation', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'test span name',
        attributes: { 'sentry.graphql.operation': { value: 'mutation TestMutation', type: 'string' } },
      },
      children: expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'graphql.operation.name': { value: 'TestMutation', type: 'string' },
            'graphql.operation.type': { value: 'mutation', type: 'string' },
            'graphql.document': {
              value: `mutation TestMutation($email: String) {
  login(email: $email)
}`,
              type: 'string',
            },
            'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
            'sentry.op': { value: 'graphql', type: 'string' },
            'graphql.processing.type': { value: 'execute', type: 'string' },
          }),
          name: 'GraphQL mutation',
          status: 'ok',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-mutation.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single mutation operation', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('test span name', (segment, children, allSpans) => {
              expect(allSpans).toEqual(expect.arrayContaining([expect.objectContaining(EXPECTED_START_SERVER_SPAN)]));
              expect({ segment, children }).toMatchObject(EXPECTED_TRACE);
            }),
          })
          .start()
          .completed();
      });
    });
  });

  describe('query without name', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'test span name',
        attributes: { 'sentry.graphql.operation': { value: 'query', type: 'string' } },
      },
      children: expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'graphql.operation.type': { value: 'query', type: 'string' },
            'graphql.document': { value: 'query {hello}', type: 'string' },
            'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
            'sentry.op': { value: 'graphql', type: 'string' },
            'graphql.processing.type': { value: 'execute', type: 'string' },
          }),
          name: 'GraphQL query',
          status: 'ok',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-no-operation-name.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single query operation without name', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('test span name', (segment, children, allSpans) => {
              expect(allSpans).toEqual(expect.arrayContaining([expect.objectContaining(EXPECTED_START_SERVER_SPAN)]));
              expect({ segment, children }).toMatchObject(EXPECTED_TRACE);
            }),
          })
          .start()
          .completed();
      });
    });
  });

  describe('multiple operations', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'test span name',
        attributes: { 'sentry.graphql.operation': { value: ['query GetWorld', 'query GetHello'], type: 'array' } },
      },
      children: expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'graphql.operation.name': { value: 'GetHello', type: 'string' },
            'graphql.operation.type': { value: 'query', type: 'string' },
            'graphql.document': { value: 'query GetHello {hello}', type: 'string' },
            'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
            'sentry.op': { value: 'graphql', type: 'string' },
            'graphql.processing.type': { value: 'execute', type: 'string' },
          }),
          name: 'GraphQL query',
          status: 'ok',
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            'graphql.operation.name': { value: 'GetWorld', type: 'string' },
            'graphql.operation.type': { value: 'query', type: 'string' },
            'graphql.document': { value: 'query GetWorld {world}', type: 'string' },
            'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
            'sentry.op': { value: 'graphql', type: 'string' },
            'graphql.processing.type': { value: 'execute', type: 'string' },
          }),
          name: 'GraphQL query',
          status: 'ok',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-multiple-operations.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with multiple query operations', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('test span name', (segment, children, allSpans) => {
              expect(allSpans).toEqual(expect.arrayContaining([expect.objectContaining(EXPECTED_START_SERVER_SPAN)]));
              expect({ segment, children }).toMatchObject(EXPECTED_TRACE);
            }),
          })
          .start()
          .completed();
      });
    });
  });

  describe('many operations', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'test span name',
        attributes: {
          'sentry.graphql.operation': {
            value: [
              'query GetHello1',
              'query GetHello2',
              'query GetHello3',
              'query GetHello4',
              'query GetHello5',
              'query GetHello6',
              'query GetHello7',
              'query GetHello8',
              'query GetHello9',
            ],
            type: 'array',
          },
        },
      },
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-multiple-operations-many.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('useOperationNameForRootSpan works with more than 5 query operations', async () => {
          await createTestRunner()
            .unordered()
            .expect({
              span: expectGraphqlTrace('test span name', (segment, children, allSpans) => {
                expect(allSpans).toEqual(expect.arrayContaining([expect.objectContaining(EXPECTED_START_SERVER_SPAN)]));
                expect({ segment, children }).toMatchObject(EXPECTED_TRACE);
              }),
            })
            .start()
            .completed();
        });
      },
    );
  });
});
