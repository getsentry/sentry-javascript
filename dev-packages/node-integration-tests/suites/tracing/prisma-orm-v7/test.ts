import {
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('Prisma ORM v7 Tests', () => {
  describeWithDockerCompose('Prisma ORM v7', { workingDirectory: [__dirname] }, () => {
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

                // Each operation span is a direct child of the transaction; the db query span is a child of its operation span.
                const rootSpanId = segment?.span_id;

                const operationSpans = spans.filter(s => s.name === 'prisma:client:operation');
                expect(operationSpans.length).toBeGreaterThanOrEqual(1);
                operationSpans.forEach(operation => {
                  expect(operation.parent_span_id).toBe(rootSpanId);
                });

                const prismaDbQuerySpan = spans.find(
                  s => s.attributes[SENTRY_ORIGIN]?.value === 'auto.db.prisma' && s.attributes[DB_QUERY_TEXT],
                );
                expect(prismaDbQuerySpan).toBeDefined();
                const dbQueryParent = spans.find(s => s.span_id === prismaDbQuerySpan?.parent_span_id);
                expect(dbQueryParent?.name).toBe('prisma:client:operation');

                // Verify Prisma spans have the correct origin
                const prismaSpans = spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.prisma');
                expect(prismaSpans.length).toBeGreaterThanOrEqual(5);

                // Check for key Prisma span descriptions
                const spanDescriptions = prismaSpans.map(span => span.name);
                expect(spanDescriptions).toContain('prisma:client:operation');
                expect(spanDescriptions).toContain('prisma:client:serialize');
                expect(spanDescriptions).toContain('prisma:client:connect');

                // Verify the create operation has correct metadata
                const createSpan = prismaSpans.find(
                  span =>
                    span.name === 'prisma:client:operation' &&
                    span.attributes['method']?.value === 'create' &&
                    span.attributes['model']?.value === 'User',
                );
                expect(createSpan).toBeDefined();

                // Verify db_query span has system info and correct op (v7 uses db.system.name).
                // The SDK should rewrite the span name to the query summary (same as v5/v6
                // `prisma:engine:db_query`), so we find it via op/origin rather than name.
                const dbQuerySpan = prismaSpans.find(
                  span => span.attributes[SENTRY_OP]?.value === DB && span.attributes[DB_QUERY_TEXT]?.value,
                );
                expect(dbQuerySpan).toBeDefined();
                expect(dbQuerySpan?.attributes[DB_SYSTEM_NAME]).toEqual({ type: 'string', value: 'postgresql' });
                expect(dbQuerySpan?.attributes[SENTRY_OP]).toEqual({ type: 'string', value: DB });
                expect(dbQuerySpan?.name).toBe(dbQuerySpan?.attributes[DB_QUERY_SUMMARY]?.value);
                expect(dbQuerySpan?.name).not.toBe('prisma:client:db_query');

                // The db query span name must always be rewritten to the query summary; the raw client span
                // name should never leak through.
                expect(spans.find(span => span.name === 'prisma:client:db_query')).toBeUndefined();

                const querySpans = spans.filter(
                  item => item.attributes[SENTRY_ORIGIN]?.value === 'auto.db.prisma' && item.attributes[DB_QUERY_TEXT],
                );

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
        additionalDependencies: {
          '@prisma/adapter-pg': '7.2.0',
          '@prisma/client': '7.2.0',
          pg: '^8.11.0',
          prisma: '7.2.0',
          typescript: '^5.9.0',
        },
        afterSetupCommand: 'prisma generate --schema prisma/schema.prisma && tsc -p prisma/tsconfig.json',
        copyPaths: ['prisma', 'prisma.config.ts'],
      },
    );
  });
});
