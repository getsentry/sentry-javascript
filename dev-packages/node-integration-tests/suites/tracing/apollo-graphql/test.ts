import { afterAll, describe, expect } from 'vitest';
import { expectGraphqlTrace } from '../graphql-test-utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Apollo Server v5 no longer runs an introspection query on start.
const EXPECTED_START_SERVER_SPAN = {
  name: 'Test Server Start',
  is_segment: true,
};

const ORIGIN = 'auto.graphql.diagnostic_channel';

function graphqlExecuteSpan(opts: {
  name: string;
  operationType: string;
  operationName?: string;
  document: unknown;
  status?: string;
}): ReturnType<typeof expect.objectContaining> {
  const { name, operationType, operationName, document, status = 'ok' } = opts;
  return expect.objectContaining({
    name,
    status,
    attributes: expect.objectContaining({
      'graphql.operation.type': { value: operationType, type: 'string' },
      ...(operationName ? { 'graphql.operation.name': { value: operationName, type: 'string' } } : {}),
      'graphql.document': { value: document, type: 'string' },
      'sentry.origin': { value: ORIGIN, type: 'string' },
    }),
  });
}

describe('GraphQL/Apollo Tests', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('query', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'Test Transaction',
        attributes: { 'sentry.graphql.operation': { value: 'query', type: 'string' } },
      },
      children: expect.arrayContaining([
        graphqlExecuteSpan({ name: 'GraphQL query', operationType: 'query', document: '{hello}' }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-query.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should instrument GraphQL queries used from Apollo Server.', async () => {
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
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });

  describe('mutation', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'Test Transaction',
        attributes: { 'sentry.graphql.operation': { value: 'mutation Mutation', type: 'string' } },
      },
      children: expect.arrayContaining([
        graphqlExecuteSpan({
          name: 'GraphQL mutation',
          operationType: 'mutation',
          operationName: 'Mutation',
          document: 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-mutation.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should instrument GraphQL mutations used from Apollo Server.', async () => {
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
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });

  describe('redaction', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'Test Transaction',
        attributes: { 'sentry.graphql.operation': { value: 'mutation', type: 'string' } },
      },
      children: expect.arrayContaining([
        // The inline email literal must be redacted to `"*"`, so the raw value never reaches the span.
        graphqlExecuteSpan({
          name: 'GraphQL mutation',
          operationType: 'mutation',
          document: expect.stringContaining('login(email: "*")'),
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-redaction.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('redacts inline literal values from the graphql document.', async () => {
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
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });

  describe('error', () => {
    const EXPECTED_TRACE = {
      segment: {
        name: 'Test Transaction',
        attributes: { 'sentry.graphql.operation': { value: 'mutation Mutation', type: 'string' } },
      },
      children: expect.arrayContaining([
        graphqlExecuteSpan({
          name: 'GraphQL mutation',
          operationType: 'mutation',
          operationName: 'Mutation',
          document: 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
          status: 'error',
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-error.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should handle GraphQL errors.', async () => {
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
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });
});
