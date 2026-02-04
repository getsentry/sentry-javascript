import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// Prisma 7 requires Node.js 20.19+
conditionalTest({ min: 20 })('Prisma ORM v7 Tests', () => {
  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test, _mode, cwd) => {
      test('should instrument PostgreSQL queries from Prisma ORM', { timeout: 75_000 }, async () => {
        await createRunner()
          .withDockerCompose({
            workingDirectory: [cwd],
            readyMatches: ['port 5432'],
            setupCommand: `yarn prisma generate --schema ${cwd}/prisma/schema.prisma && tsc -p ${cwd}/prisma/tsconfig.json && yarn prisma migrate dev -n sentry-test --schema ${cwd}/prisma/schema.prisma`,
          })
          .expect({
            transaction: transaction => {
              expect(transaction.transaction).toBe('Test Transaction');

              const spans = transaction.spans || [];
              expect(spans.length).toBeGreaterThanOrEqual(5);

              // Verify Prisma spans have the correct origin
              const prismaSpans = spans.filter(
                span => span.data && span.data['sentry.origin'] === 'auto.db.otel.prisma',
              );
              expect(prismaSpans.length).toBeGreaterThanOrEqual(5);

              // Check for key Prisma span descriptions
              const spanDescriptions = prismaSpans.map(span => span.description);
              expect(spanDescriptions).toContain('prisma:client:operation');
              expect(spanDescriptions).toContain('prisma:client:serialize');
              expect(spanDescriptions).toContain('prisma:client:connect');
              expect(spanDescriptions).toContain('prisma:client:db_query');

              // Verify the create operation has correct metadata
              const createSpan = prismaSpans.find(
                span =>
                  span.description === 'prisma:client:operation' &&
                  span.data?.['method'] === 'create' &&
                  span.data?.['model'] === 'User',
              );
              expect(createSpan).toBeDefined();

              // Verify db_query span has system info and correct op (v7 uses db.system.name)
              const dbQuerySpan = prismaSpans.find(span => span.description === 'prisma:client:db_query');
              expect(dbQuerySpan?.data?.['db.system.name']).toBe('postgresql');
              expect(dbQuerySpan?.data?.['sentry.op']).toBe('db');
              expect(dbQuerySpan?.op).toBe('db');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        '@prisma/adapter-pg': '7.2.0',
        '@prisma/client': '7.2.0',
        pg: '^8.11.0',
        prisma: '7.2.0',
        typescript: '^5.9.0',
      },
      copyPaths: ['prisma', 'prisma.config.ts', 'docker-compose.yml'],
    },
  );
});
