import type { TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

const ADDITIONAL_DEPENDENCIES = {
  '@prisma/client': '5.22.0',
  prisma: '5.22.0',
};

// Prisma v5 engine spans are minted by Sentry's v5 compatibility shim through Sentry's
// provider-agnostic span APIs, so the same span tree must be produced under both the default
// SentryTracerProvider and the opt-in OTel BasicTracerProvider (`openTelemetryBasicTracerProvider`).
function expectPrismaV5Spans(transaction: TransactionEvent): void {
  expect(transaction.transaction).toBe('Test Transaction');
  const spans = transaction.spans || [];
  expect(spans.length).toBeGreaterThanOrEqual(5);

  // Valid parents are the transaction root or any other span within the transaction.
  const validParentIds = new Set([transaction.contexts?.trace?.span_id, ...spans.map(s => s.span_id)]);

  const operationSpans = spans.filter(s => s.description === 'prisma:client:operation');
  expect(operationSpans.length).toBeGreaterThanOrEqual(1);

  // The db-query spans are materialized from the raw engine event; assert they nest inside the
  // transaction rather than dangling as orphans.
  const dbSpans = spans.filter(s => s.op === 'db');
  expect(dbSpans.length).toBeGreaterThanOrEqual(1);
  dbSpans.forEach(dbSpan => {
    expect(validParentIds.has(dbSpan.parent_span_id)).toBe(true);
  });

  const txSpan = spans.find(s => s.description === 'prisma:client:transaction');
  expect(txSpan).toBeDefined();

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        data: {
          method: 'create',
          model: 'User',
          name: 'User.create',
          'sentry.origin': 'auto.db.otel.prisma',
        },
        description: 'prisma:client:operation',
        status: 'ok',
      }),
      expect.objectContaining({
        data: {
          method: 'findMany',
          model: 'User',
          name: 'User.findMany',
          'sentry.origin': 'auto.db.otel.prisma',
        },
        description: 'prisma:client:operation',
        status: 'ok',
      }),
      expect.objectContaining({
        data: {
          'sentry.origin': 'auto.db.otel.prisma',
        },
        description: 'prisma:client:serialize',
        status: 'ok',
      }),
      expect.objectContaining({
        data: {
          'sentry.origin': 'auto.db.otel.prisma',
        },
        description: 'prisma:client:connect',
        status: 'ok',
      }),
      expect.objectContaining({
        data: {
          'db.statement': expect.stringContaining('INSERT INTO'),
          'db.system': 'postgresql',
          'sentry.kind': 'client',
          'sentry.op': 'db',
          'sentry.origin': 'auto.db.otel.prisma',
        },
        op: 'db',
        description: expect.stringContaining('INSERT INTO'),
        status: 'ok',
      }),
      expect.objectContaining({
        data: {
          'db.statement': expect.stringContaining('SELECT'),
          'db.system': 'postgresql',
          'sentry.kind': 'client',
          'sentry.op': 'db',
          'sentry.origin': 'auto.db.otel.prisma',
        },
        op: 'db',
        description: expect.stringContaining('SELECT'),
        status: 'ok',
      }),
      expect.objectContaining({
        data: {
          'db.statement': expect.stringContaining('DELETE'),
          'db.system': 'postgresql',
          'sentry.kind': 'client',
          'sentry.op': 'db',
          'sentry.origin': 'auto.db.otel.prisma',
        },
        op: 'db',
        description: expect.stringContaining('DELETE'),
        status: 'ok',
      }),
    ]),
  );
}

const AFTER_SETUP_COMMAND = 'prisma generate --schema prisma/schema.prisma';

describeWithDockerCompose('Prisma ORM v5', { workingDirectory: [__dirname] }, () => {
  describe('Prisma ORM v5 Tests', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createRunner, test) => {
        test('should instrument PostgreSQL queries from Prisma ORM', { timeout: 75_000 }, async () => {
          await createRunner().expect({ transaction: expectPrismaV5Spans }).start().completed();
        });
      },
      {
        additionalDependencies: ADDITIONAL_DEPENDENCIES,
        afterSetupCommand: AFTER_SETUP_COMMAND,
        copyPaths: ['prisma'],
      },
    );
  });

  // The BasicTracerProvider path is opt-in via `openTelemetryBasicTracerProvider: true`; it must produce
  // the same Prisma v5 span tree as the default SentryTracerProvider.
  describe('Prisma ORM v5 Tests (BasicTracerProvider)', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument-basic-tracer-provider.mjs',
      (createRunner, test) => {
        test('should instrument PostgreSQL queries from Prisma ORM', { timeout: 75_000 }, async () => {
          await createRunner().expect({ transaction: expectPrismaV5Spans }).start().completed();
        });
      },
      {
        additionalDependencies: ADDITIONAL_DEPENDENCIES,
        afterSetupCommand: AFTER_SETUP_COMMAND,
        copyPaths: ['prisma'],
      },
    );
  });
});
