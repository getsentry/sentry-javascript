import {
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { SerializedStreamedSpan } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describeWithDockerCompose('Prisma ORM v6 Tests', { workingDirectory: [__dirname] }, () => {
  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('should instrument PostgreSQL queries from Prisma ORM', { timeout: 75_000 }, async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');

              const spans = container.items.filter(span => !span.is_segment);
              expect(spans.length).toBeGreaterThanOrEqual(5);

              // Each operation span is a direct child of the transaction; the db query span is a child of the engine query span.
              const rootSpanId = segment?.span_id;

              const operationSpans = spans.filter(s => s.name === 'prisma:client:operation');
              expect(operationSpans.length).toBeGreaterThanOrEqual(1);
              operationSpans.forEach(operation => {
                expect(operation.parent_span_id).toBe(rootSpanId);
              });

              const dbQuerySpan = spans.find(
                s => s.attributes[SENTRY_ORIGIN]?.value === 'auto.db.prisma' && s.attributes[DB_QUERY_TEXT],
              );
              expect(dbQuerySpan).toBeDefined();
              const dbQueryParent = spans.find(s => s.span_id === dbQuerySpan?.parent_span_id);
              expect(dbQueryParent?.name).toBe('prisma:engine:query');

              function expectPrismaSpanToIncludeSpanWith(span: Partial<SerializedStreamedSpan>) {
                expect(spans).toContainEqual(
                  expect.objectContaining({
                    ...span,
                    attributes: expect.objectContaining({
                      ...span.attributes,
                      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
                    }),
                    status: 'ok',
                  }),
                );
              }

              expectPrismaSpanToIncludeSpanWith({
                name: 'prisma:client:detect_platform',
              });

              expectPrismaSpanToIncludeSpanWith({
                name: 'prisma:client:load_engine',
              });

              expectPrismaSpanToIncludeSpanWith({
                name: 'prisma:client:operation',
                attributes: {
                  method: { type: 'string', value: 'create' },
                  model: { type: 'string', value: 'User' },
                  name: { type: 'string', value: 'User.create' },
                },
              });

              expectPrismaSpanToIncludeSpanWith({
                name: 'prisma:client:serialize',
              });

              expectPrismaSpanToIncludeSpanWith({
                name: 'prisma:client:connect',
              });

              expectPrismaSpanToIncludeSpanWith({
                name: 'prisma:engine:connect',
              });

              expectPrismaSpanToIncludeSpanWith({
                name: 'prisma:engine:query',
              });

              expectPrismaSpanToIncludeSpanWith({
                attributes: {
                  [SENTRY_OP]: { type: 'string', value: DB },
                  [DB_QUERY_TEXT]: {
                    type: 'string',
                    value:
                      'SELECT "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name" FROM "public"."User" WHERE 1=1 OFFSET $1',
                  },
                  [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "public"."User"' },
                  [DB_SYSTEM]: { type: 'string', value: 'postgresql' },
                  [SENTRY_KIND]: { type: 'string', value: 'client' },
                },
                name: 'SELECT "public"."User"',
              });

              expectPrismaSpanToIncludeSpanWith({
                attributes: {
                  [SENTRY_OP]: { type: 'string', value: DB },
                  [DB_QUERY_TEXT]: {
                    type: 'string',
                    value: 'DELETE FROM "public"."User" WHERE "public"."User"."email"::text LIKE $1',
                  },
                  [DB_QUERY_SUMMARY]: { type: 'string', value: 'DELETE "public"."User"' },
                  [DB_SYSTEM]: { type: 'string', value: 'postgresql' },
                  [SENTRY_KIND]: { type: 'string', value: 'client' },
                },
                name: 'DELETE "public"."User"',
              });

              // The db query span name must always be rewritten to the query summary; the raw engine span
              // name should never leak through.
              expect(spans.find(span => span.name === 'prisma:engine:db_query')).toBeUndefined();

              const querySpans = spans.filter(item => item.attributes[DB_QUERY_TEXT]);

              expect(
                querySpans.map(span => ({
                  name: span.name,
                  summary: span.attributes[DB_QUERY_SUMMARY]?.value,
                })),
              ).toEqual([
                { name: 'INSERT "public"."User"', summary: 'INSERT "public"."User"' },
                { name: 'SELECT "public"."User"', summary: 'SELECT "public"."User"' },
                { name: 'DELETE "public"."User"', summary: 'DELETE "public"."User"' },
              ]);
              querySpans.forEach(span => {
                expect(span.name).not.toBe(span.attributes[DB_QUERY_TEXT]?.value);
              });
            },
          })
          .start()
          .completed();
      });
    },
    {
      afterSetupCommand: 'prisma generate --schema prisma/schema.prisma',
      copyPaths: ['prisma'],
    },
  );
});
