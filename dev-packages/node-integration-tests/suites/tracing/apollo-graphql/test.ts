import { afterAll, describe, expect } from 'vitest';
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
          const runner = createTestRunner();
          const spansPromise = runner.collectStreamedSpansUntilSegment('Test Transaction');

          await runner.start().completed();

          const spans = await spansPromise;
          expect(spans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
          const segment = spans.find(span => span.is_segment && span.name === 'Test Transaction');
          const children = spans.filter(
            span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
          );

          expect(segment?.attributes['sentry.graphql.operation']).toEqual({ value: 'query', type: 'string' });
          const executeSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'execute');
          expect(executeSpan?.name).toBe('GraphQL query');
          expect(executeSpan?.status).toBe('ok');
          expect(executeSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
          expect(executeSpan?.attributes['graphql.document']).toEqual({ value: '{hello}', type: 'string' });
          expect(executeSpan?.attributes['sentry.origin']).toEqual({
            value: 'auto.graphql.graphql',
            type: 'string',
          });
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
          const runner = createTestRunner();
          const spansPromise = runner.collectStreamedSpansUntilSegment('Test Transaction');

          await runner.start().completed();

          const spans = await spansPromise;
          expect(spans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
          const segment = spans.find(span => span.is_segment && span.name === 'Test Transaction');
          const children = spans.filter(
            span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
          );

          expect(segment?.attributes['sentry.graphql.operation']).toEqual({
            value: 'mutation Mutation',
            type: 'string',
          });
          const mutationSpan = children.find(
            span =>
              span.attributes['graphql.processing.type']?.value === 'execute' &&
              span.attributes['graphql.operation.name']?.value === 'Mutation',
          );
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
            value: 'auto.graphql.graphql',
            type: 'string',
          });
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
          const runner = createTestRunner();
          const spansPromise = runner.collectStreamedSpansUntilSegment('Test Transaction');

          await runner.start().completed();

          const spans = await spansPromise;
          expect(spans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
          const segment = spans.find(span => span.is_segment && span.name === 'Test Transaction');
          const children = spans.filter(
            span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
          );

          expect(segment?.attributes['sentry.graphql.operation']).toEqual({ value: 'mutation', type: 'string' });
          const executeSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'execute');
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
            value: 'auto.graphql.graphql',
            type: 'string',
          });
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
          const runner = createTestRunner();
          const spansPromise = runner.collectStreamedSpansUntilSegment('Test Transaction');

          await runner.start().completed();

          const spans = await spansPromise;
          expect(spans.find(span => span.is_segment && span.name === 'Test Server Start')).toBeDefined();
          const segment = spans.find(span => span.is_segment && span.name === 'Test Transaction');
          const children = spans.filter(
            span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment?.span_id,
          );

          expect(segment?.attributes['sentry.graphql.operation']).toEqual({
            value: 'mutation Mutation',
            type: 'string',
          });
          const mutationSpan = children.find(
            span =>
              span.attributes['graphql.processing.type']?.value === 'execute' &&
              span.attributes['graphql.operation.name']?.value === 'Mutation',
          );
          expect(mutationSpan?.name).toBe('GraphQL mutation');
          expect(mutationSpan?.status).toBe('error');
          expect(mutationSpan?.attributes['sentry.status.message']).toEqual({
            value: 'internal_error',
            type: 'string',
          });
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
            value: 'auto.graphql.graphql',
            type: 'string',
          });
        });
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });
});
