import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('GraphQL/Apollo Tests > useOperationNameForRootSpan', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('single query operation', () => {
    createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single query operation', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
              const segment = container.items.find(span => span.is_segment && span.name === 'test span name');
              const children = container.items.filter(
                span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
              );

              expect(segment?.attributes['sentry.graphql.operation']).toEqual({
                value: 'query GetHello',
                type: 'string',
              });
              const getHelloSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'GetHello',
              );
              expect(getHelloSpan?.name).toBe('GraphQL query');
              expect(getHelloSpan?.status).toBe('ok');
              expect(getHelloSpan?.attributes['graphql.operation.name']).toEqual({ value: 'GetHello', type: 'string' });
              expect(getHelloSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
              expect(getHelloSpan?.attributes['graphql.document']).toEqual({
                value: 'query GetHello {hello}',
                type: 'string',
              });
              expect(getHelloSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(getHelloSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(getHelloSpan?.attributes['graphql.processing.type']).toEqual({ value: 'execute', type: 'string' });
            },
          })
          .start()
          .completed();
      });
    });
  });

  describe('single mutation operation', () => {
    createEsmAndCjsTests(__dirname, 'scenario-mutation.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single mutation operation', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
              const segment = container.items.find(span => span.is_segment && span.name === 'test span name');
              const children = container.items.filter(
                span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
              );

              expect(segment?.attributes['sentry.graphql.operation']).toEqual({
                value: 'mutation TestMutation',
                type: 'string',
              });
              const testMutationSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'TestMutation',
              );
              expect(testMutationSpan?.name).toBe('GraphQL mutation');
              expect(testMutationSpan?.status).toBe('ok');
              expect(testMutationSpan?.attributes['graphql.operation.name']).toEqual({
                value: 'TestMutation',
                type: 'string',
              });
              expect(testMutationSpan?.attributes['graphql.operation.type']).toEqual({
                value: 'mutation',
                type: 'string',
              });
              expect(testMutationSpan?.attributes['graphql.document']).toEqual({
                value: 'mutation TestMutation($email: String) {\n  login(email: $email)\n}',
                type: 'string',
              });
              expect(testMutationSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(testMutationSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(testMutationSpan?.attributes['graphql.processing.type']).toEqual({
                value: 'execute',
                type: 'string',
              });
            },
          })
          .start()
          .completed();
      });
    });
  });

  describe('query without name', () => {
    createEsmAndCjsTests(__dirname, 'scenario-no-operation-name.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single query operation without name', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
              const segment = container.items.find(span => span.is_segment && span.name === 'test span name');
              const children = container.items.filter(
                span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
              );

              expect(segment?.attributes['sentry.graphql.operation']).toEqual({ value: 'query', type: 'string' });
              const executeSpan = children.find(
                span => span.attributes['graphql.processing.type']?.value === 'execute',
              );
              expect(executeSpan?.name).toBe('GraphQL query');
              expect(executeSpan?.status).toBe('ok');
              expect(executeSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
              expect(executeSpan?.attributes['graphql.document']).toEqual({ value: 'query {hello}', type: 'string' });
              expect(executeSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(executeSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(executeSpan?.attributes['graphql.processing.type']).toEqual({ value: 'execute', type: 'string' });
            },
          })
          .start()
          .completed();
      });
    });
  });

  describe('multiple operations', () => {
    createEsmAndCjsTests(__dirname, 'scenario-multiple-operations.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with multiple query operations', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
              const segment = container.items.find(span => span.is_segment && span.name === 'test span name');
              const children = container.items.filter(
                span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
              );

              expect(segment?.attributes['sentry.graphql.operation']).toEqual({
                value: ['query GetWorld', 'query GetHello'],
                type: 'array',
              });
              const getHelloSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'GetHello',
              );
              expect(getHelloSpan?.name).toBe('GraphQL query');
              expect(getHelloSpan?.status).toBe('ok');
              expect(getHelloSpan?.attributes['graphql.operation.name']).toEqual({ value: 'GetHello', type: 'string' });
              expect(getHelloSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
              expect(getHelloSpan?.attributes['graphql.document']).toEqual({
                value: 'query GetHello {hello}',
                type: 'string',
              });
              expect(getHelloSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(getHelloSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(getHelloSpan?.attributes['graphql.processing.type']).toEqual({ value: 'execute', type: 'string' });
              const getWorldSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'GetWorld',
              );
              expect(getWorldSpan?.name).toBe('GraphQL query');
              expect(getWorldSpan?.status).toBe('ok');
              expect(getWorldSpan?.attributes['graphql.operation.name']).toEqual({ value: 'GetWorld', type: 'string' });
              expect(getWorldSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
              expect(getWorldSpan?.attributes['graphql.document']).toEqual({
                value: 'query GetWorld {world}',
                type: 'string',
              });
              expect(getWorldSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(getWorldSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(getWorldSpan?.attributes['graphql.processing.type']).toEqual({ value: 'execute', type: 'string' });
            },
          })
          .start()
          .completed();
      });
    });
  });
});
