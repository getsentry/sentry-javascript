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
            setupCommand: `yarn prisma generate --schema ${cwd}/prisma/schema.prisma && yarn prisma migrate dev -n sentry-test --schema ${cwd}/prisma/schema.prisma`,
          })
          .expect({
            transaction: transaction => {
              expect(transaction.transaction).toBe('Test Transaction');

              const spans = transaction.spans || [];
              expect(spans.length).toBeGreaterThanOrEqual(5);

              // Each operation span is a direct child of the transaction; the db query span is a child of the engine query span.
              const rootSpanId = transaction.contexts?.trace?.span_id;

              const operationSpans = spans.filter(s => s.description === 'prisma:client:operation');
              expect(operationSpans.length).toBeGreaterThanOrEqual(1);
              operationSpans.forEach(operation => {
                expect(operation.parent_span_id).toBe(rootSpanId);
              });

              const dbQuerySpan = spans.find(
                s => s.data?.['sentry.origin'] === 'auto.db.otel.prisma' && s.data?.['db.query.text'],
              );
              expect(dbQuerySpan).toBeDefined();
              const dbQueryParent = spans.find(s => s.span_id === dbQuerySpan?.parent_span_id);
              expect(dbQueryParent?.description).toBe('prisma:engine:query');

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

              // The db query span name must always be rewritten to the SQL text; the raw engine span
              // name should never leak through.
              expect(spans.find(span => span.description === 'prisma:engine:db_query')).toBeUndefined();
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
