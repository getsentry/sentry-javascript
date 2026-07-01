import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('Prisma ORM v5 Tests', () => {
  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test, _mode, cwd) => {
      test('should instrument PostgreSQL queries from Prisma ORM', { timeout: 75_000 }, async () => {
        await createRunner()
          .withDockerCompose({
            workingDirectory: [cwd],
            setupCommand: 'yarn prisma generate && yarn prisma migrate dev -n sentry-test',
          })
          .expect({
            transaction: transaction => {
              expect(transaction.transaction).toBe('Test Transaction');
              const spans = transaction.spans || [];
              expect(spans.length).toBeGreaterThanOrEqual(5);

              const spanIds = new Set(spans.map(s => s.span_id));

              const operationSpans = spans.filter(s => s.description === 'prisma:client:operation');
              expect(operationSpans.length).toBeGreaterThanOrEqual(1);

              // The db-query spans are materialized from the raw engine event; assert they nest inside the
              // transaction (their parent is another span in it) rather than dangling as orphans — a flat
              // `toContainEqual` check below would pass for an orphaned span too.
              const dbSpans = spans.filter(s => s.op === 'db');
              expect(dbSpans.length).toBeGreaterThanOrEqual(1);
              dbSpans.forEach(dbSpan => {
                expect(spanIds.has(dbSpan.parent_span_id!)).toBe(true);
              });

              const txSpan = spans.find(s => s.description === 'prisma:client:transaction');
              expect(txSpan).toBeDefined();

              expect(spans).toContainEqual(
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
              );

              expect(spans).toContainEqual(
                expect.objectContaining({
                  data: {
                    'sentry.origin': 'auto.db.otel.prisma',
                  },
                  description: 'prisma:client:serialize',
                  status: 'ok',
                }),
              );

              expect(spans).toContainEqual(
                expect.objectContaining({
                  data: {
                    'sentry.origin': 'auto.db.otel.prisma',
                  },
                  description: 'prisma:client:connect',
                  status: 'ok',
                }),
              );
              expect(spans).toContainEqual(
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
              );
              expect(spans).toContainEqual(
                expect.objectContaining({
                  data: {
                    'sentry.origin': 'auto.db.otel.prisma',
                  },
                  description: 'prisma:client:serialize',
                  status: 'ok',
                }),
              );
              expect(spans).toContainEqual(
                expect.objectContaining({
                  data: {
                    'db.statement': expect.stringContaining('INSERT INTO'),
                    'db.system': 'postgresql',
                    'otel.kind': 'CLIENT',
                    'sentry.op': 'db',
                    'sentry.origin': 'auto.db.otel.prisma',
                  },
                  op: 'db',
                  description: expect.stringContaining('INSERT INTO'),
                  status: 'ok',
                }),
              );
              expect(spans).toContainEqual(
                expect.objectContaining({
                  data: {
                    'db.statement': expect.stringContaining('SELECT'),
                    'db.system': 'postgresql',
                    'otel.kind': 'CLIENT',
                    'sentry.op': 'db',
                    'sentry.origin': 'auto.db.otel.prisma',
                  },
                  op: 'db',
                  description: expect.stringContaining('SELECT'),
                  status: 'ok',
                }),
              );
              expect(spans).toContainEqual(
                expect.objectContaining({
                  data: {
                    'db.statement': expect.stringContaining('DELETE'),
                    'db.system': 'postgresql',
                    'otel.kind': 'CLIENT',
                    'sentry.op': 'db',
                    'sentry.origin': 'auto.db.otel.prisma',
                  },
                  op: 'db',
                  description: expect.stringContaining('DELETE'),
                  status: 'ok',
                }),
              );
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        '@prisma/client': '5.22.0',
        prisma: '5.22.0',
      },
      copyPaths: ['prisma', 'docker-compose.yml'],
    },
  );
});
