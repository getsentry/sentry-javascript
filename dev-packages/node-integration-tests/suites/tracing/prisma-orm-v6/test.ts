import type { SpanJSON } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('Prisma ORM v6 Tests', () => {
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
            setupCommand: `yarn prisma generate --schema ${cwd}/prisma/schema.prisma && yarn prisma migrate dev -n sentry-test --schema ${cwd}/prisma/schema.prisma`,
          })
          .expect({
            transaction: transaction => {
              expect(transaction.transaction).toBe('Test Transaction');

              const spans = transaction.spans || [];
              expect(spans.length).toBeGreaterThanOrEqual(5);

              function expectPrismaSpanToIncludeSpanWith(span: Partial<SpanJSON>) {
                expect(spans).toContainEqual(
                  expect.objectContaining({
                    ...span,
                    data: {
                      ...span.data,
                      'sentry.origin': 'auto.db.otel.prisma',
                    },
                    status: 'ok',
                  }),
                );
              }

              expectPrismaSpanToIncludeSpanWith({
                description: 'prisma:client:detect_platform',
              });

              expectPrismaSpanToIncludeSpanWith({
                description: 'prisma:client:load_engine',
              });

              expectPrismaSpanToIncludeSpanWith({
                description: 'prisma:client:operation',
                data: {
                  method: 'create',
                  model: 'User',
                  name: 'User.create',
                },
              });

              expectPrismaSpanToIncludeSpanWith({
                description: 'prisma:client:serialize',
              });

              expectPrismaSpanToIncludeSpanWith({
                description: 'prisma:client:connect',
              });

              expectPrismaSpanToIncludeSpanWith({
                description: 'prisma:engine:connect',
              });

              expectPrismaSpanToIncludeSpanWith({
                description: 'prisma:engine:query',
              });

              expectPrismaSpanToIncludeSpanWith({
                data: {
                  'sentry.op': 'db',
                  'db.query.text':
                    'SELECT "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name" FROM "public"."User" WHERE 1=1 OFFSET $1',
                  'db.system': 'postgresql',
                  'otel.kind': 'CLIENT',
                },
                description:
                  'SELECT "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name" FROM "public"."User" WHERE 1=1 OFFSET $1',
              });

              expectPrismaSpanToIncludeSpanWith({
                data: {
                  'sentry.op': 'db',
                  'db.query.text': 'DELETE FROM "public"."User" WHERE "public"."User"."email"::text LIKE $1',
                  'db.system': 'postgresql',
                  'otel.kind': 'CLIENT',
                },
                description: 'DELETE FROM "public"."User" WHERE "public"."User"."email"::text LIKE $1',
              });
            },
          })
          .start()
          .completed();
      });
    },
    {
      copyPaths: ['prisma', 'docker-compose.yml'],
    },
  );
});
