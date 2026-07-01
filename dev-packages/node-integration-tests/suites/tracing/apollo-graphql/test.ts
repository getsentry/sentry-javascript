import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Server start transaction (Apollo Server v5 no longer runs introspection query on start)
const EXPECTED_START_SERVER_TRANSACTION = {
  transaction: 'Test Server Start',
};

// The OTel and diagnostics-channel (orchestrion) instrumentations must produce identical spans — only
// the injection mechanism and the span origin differ. Each scenario runs against both, asserting the
// matching origin, so the orchestrion path is proven a drop-in replacement without duplicating cases.
const VARIANTS = [
  { label: 'otel', instrument: 'instrument.mjs', origin: 'auto.graphql.otel.graphql' },
  { label: 'orchestrion', instrument: 'instrument-orchestrion.mjs', origin: 'auto.graphql.orchestrion.graphql' },
] as const;

describe('GraphQL/Apollo Tests', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('query', () => {
    for (const { label, instrument, origin } of VARIANTS) {
      const EXPECTED_TRANSACTION = {
        transaction: 'Test Transaction (query)',
        spans: expect.arrayContaining([
          expect.objectContaining({
            data: {
              'graphql.operation.type': 'query',
              'graphql.source': '{hello}',
              'sentry.origin': origin,
            },
            description: 'query',
            status: 'ok',
            origin,
          }),
        ]),
      };

      createEsmAndCjsTests(
        __dirname,
        'scenario-query.mjs',
        instrument,
        (createTestRunner, test) => {
          test(`should instrument GraphQL queries used from Apollo Server (${label}).`, async () => {
            await createTestRunner()
              .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
              .expect({ transaction: EXPECTED_TRANSACTION })
              .unordered()
              .start()
              .completed();
          });
        },
        { copyPaths: ['apollo-server.mjs'] },
      );
    }
  });

  describe('mutation', () => {
    for (const { label, instrument, origin } of VARIANTS) {
      const EXPECTED_TRANSACTION = {
        transaction: 'Test Transaction (mutation Mutation)',
        spans: expect.arrayContaining([
          expect.objectContaining({
            data: {
              'graphql.operation.name': 'Mutation',
              'graphql.operation.type': 'mutation',
              'graphql.source': 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
              'sentry.origin': origin,
            },
            description: 'mutation Mutation',
            status: 'ok',
            origin,
          }),
        ]),
      };

      createEsmAndCjsTests(
        __dirname,
        'scenario-mutation.mjs',
        instrument,
        (createTestRunner, test) => {
          test(`should instrument GraphQL mutations used from Apollo Server (${label}).`, async () => {
            await createTestRunner()
              .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
              .expect({ transaction: EXPECTED_TRANSACTION })
              .unordered()
              .start()
              .completed();
          });
        },
        { copyPaths: ['apollo-server.mjs'] },
      );
    }
  });

  describe('redaction', () => {
    for (const { label, instrument, origin } of VARIANTS) {
      const EXPECTED_TRANSACTION = {
        transaction: 'Test Transaction (mutation)',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'mutation',
            status: 'ok',
            origin,
            data: expect.objectContaining({
              'graphql.operation.type': 'mutation',
              // The inline email literal must be redacted to `"*"`, so the raw value can never reach `graphql.source`.
              'graphql.source': expect.stringContaining('login(email: "*")'),
              'sentry.origin': origin,
            }),
          }),
        ]),
      };

      createEsmAndCjsTests(
        __dirname,
        'scenario-redaction.mjs',
        instrument,
        (createTestRunner, test) => {
          test(`redacts inline literal values from graphql.source (${label}).`, async () => {
            await createTestRunner()
              .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
              .expect({ transaction: EXPECTED_TRANSACTION })
              .unordered()
              .start()
              .completed();
          });
        },
        { copyPaths: ['apollo-server.mjs'] },
      );
    }
  });

  describe('error', () => {
    for (const { label, instrument, origin } of VARIANTS) {
      const EXPECTED_TRANSACTION = {
        transaction: 'Test Transaction (mutation Mutation)',
        spans: expect.arrayContaining([
          expect.objectContaining({
            data: {
              'graphql.operation.name': 'Mutation',
              'graphql.operation.type': 'mutation',
              'graphql.source': 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
              'sentry.origin': origin,
            },
            description: 'mutation Mutation',
            status: 'internal_error',
            origin,
          }),
        ]),
      };

      createEsmAndCjsTests(
        __dirname,
        'scenario-error.mjs',
        instrument,
        (createTestRunner, test) => {
          test(`should handle GraphQL errors (${label}).`, async () => {
            await createTestRunner()
              .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
              .expect({ transaction: EXPECTED_TRANSACTION })
              .unordered()
              .start()
              .completed();
          });
        },
        { copyPaths: ['apollo-server.mjs'] },
      );
    }
  });
});
