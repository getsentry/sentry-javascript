import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('Prisma ORM v5 Tests', () => {
  test('CJS - should instrument PostgreSQL queries from Prisma ORM', { timeout: 75_000 }, async () => {
    await createRunner(__dirname, 'scenario.js')
      .withDockerCompose({
        workingDirectory: [__dirname],
        waitForPorts: [5432],
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
