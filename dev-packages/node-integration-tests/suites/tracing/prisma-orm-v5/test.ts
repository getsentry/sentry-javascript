import {
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_STATEMENT,
  DB_SYSTEM,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// Prisma 5 only reports the raw `db.statement`; `db.query.text` is the SDK's sanitized copy of it.
const INSERT_USER_QUERY_TEXT =
  'INSERT INTO "public"."User" ("createdAt","email","name") VALUES ($1,$2,$3) RETURNING "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name"';
const SELECT_USER_QUERY_TEXT =
  'SELECT "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name" FROM "public"."User" WHERE ?=? OFFSET $1';
const DELETE_USER_QUERY_TEXT = 'DELETE FROM "public"."User" WHERE "public"."User"."email"::text LIKE $1';

const ADDITIONAL_DEPENDENCIES = {
  '@prisma/client': '5.22.0',
  prisma: '5.22.0',
};

function expectPrismaV5Spans(container: SerializedStreamedSpanContainer): void {
  const segment = container.items.find(span => span.is_segment);
  expect(segment?.name).toBe('Test Transaction');
  const spans = container.items.filter(span => !span.is_segment);
  expect(spans.length).toBeGreaterThanOrEqual(5);

  // Valid parents are the transaction root or any other span within the transaction.
  const validParentIds = new Set([segment?.span_id, ...spans.map(s => s.span_id)]);

  const operationSpans = spans.filter(s => s.name === 'prisma:client:operation');
  expect(operationSpans.length).toBeGreaterThanOrEqual(1);

  // The db-query spans are materialized from the raw engine event; assert they nest inside the
  // transaction rather than dangling as orphans.
  const dbSpans = spans.filter(s => s.attributes[SENTRY_OP]?.value === DB);
  expect(dbSpans.length).toBeGreaterThanOrEqual(1);
  dbSpans.forEach(dbSpan => {
    expect(validParentIds.has(dbSpan.parent_span_id)).toBe(true);
  });

  const txSpan = spans.find(s => s.name === 'prisma:client:transaction');
  expect(txSpan).toBeDefined();

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attributes: expect.objectContaining({
          method: { type: 'string', value: 'create' },
          model: { type: 'string', value: 'User' },
          name: { type: 'string', value: 'User.create' },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
        }),
        name: 'prisma:client:operation',
        status: 'ok',
      }),
      expect.objectContaining({
        attributes: expect.objectContaining({
          method: { type: 'string', value: 'findMany' },
          model: { type: 'string', value: 'User' },
          name: { type: 'string', value: 'User.findMany' },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
        }),
        name: 'prisma:client:operation',
        status: 'ok',
      }),
      expect.objectContaining({
        attributes: expect.objectContaining({
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
        }),
        name: 'prisma:client:serialize',
        status: 'ok',
      }),
      expect.objectContaining({
        attributes: expect.objectContaining({
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
        }),
        name: 'prisma:client:connect',
        status: 'ok',
      }),
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_STATEMENT]: { type: 'string', value: expect.stringContaining('INSERT INTO') },
          [DB_QUERY_TEXT]: { type: 'string', value: INSERT_USER_QUERY_TEXT },
          [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "public"."User"' },
          [DB_SYSTEM]: { type: 'string', value: 'postgresql' },
          [SENTRY_KIND]: { type: 'string', value: 'client' },
          [SENTRY_OP]: { type: 'string', value: DB },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
        }),
        name: 'INSERT "public"."User"',
        status: 'ok',
      }),
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_STATEMENT]: { type: 'string', value: expect.stringContaining('SELECT') },
          [DB_QUERY_TEXT]: { type: 'string', value: SELECT_USER_QUERY_TEXT },
          [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "public"."User"' },
          [DB_SYSTEM]: { type: 'string', value: 'postgresql' },
          [SENTRY_KIND]: { type: 'string', value: 'client' },
          [SENTRY_OP]: { type: 'string', value: DB },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
        }),
        name: 'SELECT "public"."User"',
        status: 'ok',
      }),
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_STATEMENT]: { type: 'string', value: expect.stringContaining('DELETE') },
          [DB_QUERY_TEXT]: { type: 'string', value: DELETE_USER_QUERY_TEXT },
          [DB_QUERY_SUMMARY]: { type: 'string', value: 'DELETE "public"."User"' },
          [DB_SYSTEM]: { type: 'string', value: 'postgresql' },
          [SENTRY_KIND]: { type: 'string', value: 'client' },
          [SENTRY_OP]: { type: 'string', value: DB },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.prisma' },
        }),
        name: 'DELETE "public"."User"',
        status: 'ok',
      }),
    ]),
  );

  const querySpans = spans.filter(item => item.attributes[DB_STATEMENT]);

  expect(
    querySpans.map(span => ({
      name: span.name,
      summary: span.attributes[DB_QUERY_SUMMARY]?.value,
      text: span.attributes[DB_QUERY_TEXT]?.value,
    })),
  ).toEqual([
    { name: 'INSERT "public"."User"', summary: 'INSERT "public"."User"', text: INSERT_USER_QUERY_TEXT },
    { name: 'SELECT "public"."User"', summary: 'SELECT "public"."User"', text: SELECT_USER_QUERY_TEXT },
    { name: 'BEGIN', summary: 'BEGIN', text: 'BEGIN' },
    { name: 'INSERT "public"."User"', summary: 'INSERT "public"."User"', text: INSERT_USER_QUERY_TEXT },
    { name: 'SELECT "public"."User"', summary: 'SELECT "public"."User"', text: SELECT_USER_QUERY_TEXT },
    { name: 'COMMIT', summary: 'COMMIT', text: 'COMMIT' },
    { name: 'DELETE "public"."User"', summary: 'DELETE "public"."User"', text: DELETE_USER_QUERY_TEXT },
  ]);

  // The raw engine span name must never leak through.
  expect(spans.map(span => span.name)).not.toContain('prisma:engine:db_query');
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
          await createRunner().expect({ span: expectPrismaV5Spans }).start().completed();
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
