import { afterAll, describe, expect } from 'vitest';
import { expectGraphqlTrace } from '../graphql-test-utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('GraphQL/Apollo Tests', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('query', () => {
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
                expect(allSpans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
                expect(segment.name).toBe('Test Transaction');
                expect(segment.attributes['sentry.graphql.operation']).toEqual({ value: 'query', type: 'string' });
                const executeSpan = children.find(
                  span => span.attributes['graphql.processing.type']?.value === 'execute',
                );
                expect(executeSpan).toBeDefined();
                expect(executeSpan?.name).toBe('GraphQL query');
                expect(executeSpan?.status).toBe('ok');
                expect(executeSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
                expect(executeSpan?.attributes['graphql.document']).toEqual({ value: '{hello}', type: 'string' });
                expect(executeSpan?.attributes['sentry.origin']).toEqual({
                  value: 'auto.graphql.diagnostic_channel',
                  type: 'string',
                });
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
                expect(allSpans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
                expect(segment.name).toBe('Test Transaction');
                expect(segment.attributes['sentry.graphql.operation']).toEqual({
                  value: 'mutation Mutation',
                  type: 'string',
                });
                const mutationSpan = children.find(
                  span =>
                    span.attributes['graphql.processing.type']?.value === 'execute' &&
                    span.attributes['graphql.operation.name']?.value === 'Mutation',
                );
                expect(mutationSpan).toBeDefined();
                expect(mutationSpan?.name).toBe('GraphQL mutation');
                expect(mutationSpan?.status).toBe('ok');
                expect(mutationSpan?.attributes['graphql.operation.type']).toEqual({
                  value: 'mutation',
                  type: 'string',
                });
                expect(mutationSpan?.attributes['graphql.operation.name']).toEqual({
                  value: 'Mutation',
                  type: 'string',
                });
                expect(mutationSpan?.attributes['graphql.document']).toEqual({
                  value: 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
                  type: 'string',
                });
                expect(mutationSpan?.attributes['sentry.origin']).toEqual({
                  value: 'auto.graphql.diagnostic_channel',
                  type: 'string',
                });
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
                expect(allSpans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
                expect(segment.name).toBe('Test Transaction');
                expect(segment.attributes['sentry.graphql.operation']).toEqual({ value: 'mutation', type: 'string' });
                const executeSpan = children.find(
                  span => span.attributes['graphql.processing.type']?.value === 'execute',
                );
                expect(executeSpan).toBeDefined();
                expect(executeSpan?.name).toBe('GraphQL mutation');
                expect(executeSpan?.status).toBe('ok');
                expect(executeSpan?.attributes['graphql.operation.type']).toEqual({
                  value: 'mutation',
                  type: 'string',
                });
                expect(executeSpan?.attributes['graphql.document']).toEqual({
                  value: expect.stringContaining('login(email: "*")'),
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
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });

  describe('error', () => {
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
                expect(allSpans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
                expect(segment.name).toBe('Test Transaction');
                expect(segment.attributes['sentry.graphql.operation']).toEqual({
                  value: 'mutation Mutation',
                  type: 'string',
                });
                const mutationSpan = children.find(
                  span =>
                    span.attributes['graphql.processing.type']?.value === 'execute' &&
                    span.attributes['graphql.operation.name']?.value === 'Mutation',
                );
                expect(mutationSpan).toBeDefined();
                expect(mutationSpan?.name).toBe('GraphQL mutation');
                expect(mutationSpan?.status).toBe('error');
                expect(mutationSpan?.attributes['graphql.operation.type']).toEqual({
                  value: 'mutation',
                  type: 'string',
                });
                expect(mutationSpan?.attributes['graphql.operation.name']).toEqual({
                  value: 'Mutation',
                  type: 'string',
                });
                expect(mutationSpan?.attributes['graphql.document']).toEqual({
                  value: 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
                  type: 'string',
                });
                expect(mutationSpan?.attributes['sentry.origin']).toEqual({
                  value: 'auto.graphql.diagnostic_channel',
                  type: 'string',
                });
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
