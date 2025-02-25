import { afterAll, describe, expect, test, vi } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

// When running docker compose, we need a larger timeout, as this takes some time...
vi.setConfig({ testTimeout: 75_000 });

afterAll(() => {
  cleanupChildProcesses();
});

describe('Prisma ORM v5 Tests', () => {
  test('CJS - should instrument PostgreSQL queries from Prisma ORM', async () => {
    await createRunner(__dirname, 'scenario.js')
      .withDockerCompose({
        workingDirectory: [__dirname],
        readyMatches: ['port 5432'],
        setupCommand: 'yarn && yarn setup',
      })
      .expect({
        transaction: transaction => {
          expect(transaction.transaction).toBe('Test Transaction');
          const spans = transaction.spans || [];
          expect(spans.length).toBeGreaterThanOrEqual(5);

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
        },
      })
      .start()
      .completed();
  });
});
