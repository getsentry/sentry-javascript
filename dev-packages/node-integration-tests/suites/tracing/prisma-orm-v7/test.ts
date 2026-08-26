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
              transaction: transaction => {
                expect(transaction.transaction).toBe('Test Transaction');

                const spans = transaction.spans || [];
                expect(spans.length).toBeGreaterThanOrEqual(5);

                // Each operation span is a direct child of the transaction; the db query span is a child of its operation span.
                const rootSpanId = transaction.contexts?.trace?.span_id;

                const operationSpans = spans.filter(s => s.description === 'prisma:client:operation');
                expect(operationSpans.length).toBeGreaterThanOrEqual(1);
                operationSpans.forEach(operation => {
                  expect(operation.parent_span_id).toBe(rootSpanId);
                });

                const prismaDbQuerySpan = spans.find(
                  s => s.data?.['sentry.origin'] === 'auto.db.prisma' && s.data?.['db.query.text'],
                );
                expect(prismaDbQuerySpan).toBeDefined();
                const dbQueryParent = spans.find(s => s.span_id === prismaDbQuerySpan?.parent_span_id);
                expect(dbQueryParent?.description).toBe('prisma:client:operation');

                // Verify Prisma spans have the correct origin
                const prismaSpans = spans.filter(span => span.data && span.data['sentry.origin'] === 'auto.db.prisma');
                expect(prismaSpans.length).toBeGreaterThanOrEqual(5);

                // Check for key Prisma span descriptions
                const spanDescriptions = prismaSpans.map(span => span.description);
                expect(spanDescriptions).toContain('prisma:client:operation');
                expect(spanDescriptions).toContain('prisma:client:serialize');
                expect(spanDescriptions).toContain('prisma:client:connect');

                // Verify the create operation has correct metadata
                const createSpan = prismaSpans.find(
                  span =>
                    span.description === 'prisma:client:operation' &&
                    span.data?.['method'] === 'create' &&
                    span.data?.['model'] === 'User',
                );
                expect(createSpan).toBeDefined();

                // Verify db_query span has system info and correct op (v7 uses db.system.name).
                // The SDK should rewrite the span name to the actual SQL text (same as v5/v6
                // `prisma:engine:db_query`), so we find it via op/origin rather than description.
                const dbQuerySpan = prismaSpans.find(
                  span => span.data?.['sentry.op'] === 'db' && span.data?.['db.query.text'],
                );
                expect(dbQuerySpan).toBeDefined();
                expect(dbQuerySpan?.data?.['db.system.name']).toBe('postgresql');
                expect(dbQuerySpan?.op).toBe('db');
                expect(dbQuerySpan?.description).toBe(dbQuerySpan?.data?.['db.query.text']);
                expect(dbQuerySpan?.description).not.toBe('prisma:client:db_query');

                // The db query span name must always be rewritten to the SQL text; the raw client span
                // name should never leak through.
                expect(spans.find(span => span.description === 'prisma:client:db_query')).toBeUndefined();
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

    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument-span-streaming.mjs',
      (createRunner, test) => {
        test(
          'should name db query spans after the query summary with span streaming',
          { timeout: 75_000 },
          async () => {
            await createRunner()
              .expect({
                span: container => {
                  // v7 runs the queries through the `pg` adapter, whose own spans are named after the full
                  // statement by a different integration, so they are filtered out here.
                  const querySpans = container.items.filter(
                    item =>
                      item.attributes['sentry.origin']?.value === 'auto.db.otel.prisma' &&
                      item.attributes['db.query.text'],
                  );

                  // `SELECT "public"` is what the core query-summary helper derives from a schema-qualified,
                  // quoted table (it stops at the first quoted identifier).
                  expect(
                    querySpans.map(span => ({
                      name: span.name,
                      summary: span.attributes['db.query.summary']?.value,
                    })),
                  ).toEqual([
                    { name: 'INSERT "public"."User"', summary: 'INSERT "public"."User"' },
                    { name: 'SELECT "public"', summary: 'SELECT "public"' },
                    { name: 'DELETE "public"."User"', summary: 'DELETE "public"."User"' },
                  ]);

                  // Neither the raw client span name nor the full statement may end up as a span name.
                  expect(container.items.map(span => span.name)).not.toContain('prisma:client:db_query');
                  querySpans.forEach(span => {
                    expect(span.name).not.toBe(span.attributes['db.query.text']?.value);
                  });
                },
              })
              .start()
              .completed();
          },
        );
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
