import type { SerializedStreamedSpan } from '@sentry/core';
import {
  DB_NAMESPACE,
  DB_OPERATION_BATCH_SIZE,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { RUNTIME, streamedAttribute as attr } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

const ORIGIN = 'auto.db.neon';

const CREATE_USER_TABLE_STATEMENT =
  'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))';

// Both drivers report the same connection attributes: the WebSocket driver from pg's
// `connectionParameters`, the HTTP driver from the resolved connection URL.
const CONNECTION_ATTRIBUTES = {
  [DB_SYSTEM_NAME]: attr('postgresql'),
  [DB_NAMESPACE]: attr('tests'),
  [DB_USER]: attr('test'),
  [SERVER_ADDRESS]: attr('db.localtest.me'),
  [SERVER_PORT]: attr(5432, 'integer'),
};

function expectedDbSpan({
  name,
  statement,
  status = 'ok',
  batchSize,
}: {
  name: string;
  statement: string;
  status?: 'ok' | 'error';
  batchSize?: number;
}): unknown {
  return expect.objectContaining({
    attributes: expect.objectContaining({
      ...CONNECTION_ATTRIBUTES,
      [SENTRY_OP]: attr(DB),
      [SENTRY_KIND]: attr('client'),
      [SENTRY_ORIGIN]: attr(ORIGIN),
      [DB_QUERY_TEXT]: attr(statement),
      [DB_QUERY_SUMMARY]: attr(name),
      ...(batchSize ? { [DB_OPERATION_BATCH_SIZE]: attr(batchSize, 'integer') } : {}),
    }),
    is_segment: false,
    name,
    parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
    status,
  });
}

function getNeonSpans(spans: SerializedStreamedSpan[]): SerializedStreamedSpan[] {
  const neonSpans = spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN);
  // `server.address`/`server.port` describe the connection; the deprecated string is not emitted.
  expect(neonSpans.some(span => 'db.connection_string' in span.attributes)).toBe(false);
  return neonSpans;
}

describeWithDockerCompose('neon auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('http driver', () => {
    createEsmAndCjsTests(__dirname, 'scenario-http.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('instruments `neon()` queries, templates and transactions', { timeout: 90_000 }, async () => {
        const runner = createTestRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('Test Span');

        await runner.start().completed();

        const spans = await spansPromise;
        const segment = spans.find(span => span.is_segment && span.name === 'Test Span');
        expect(segment).toBeDefined();

        const neonSpans = getNeonSpans(spans);
        expect(neonSpans.every(span => span.parent_span_id === segment!.span_id)).toBe(true);
        expect(neonSpans).toEqual([
          expectedDbSpan({ name: 'CREATE TABLE "User"', statement: CREATE_USER_TABLE_STATEMENT }),
          expectedDbSpan({ name: 'INSERT "User"', statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)' }),
          expectedDbSpan({ name: 'SELECT "User"', statement: 'SELECT * FROM "User" WHERE "name" = $1' }),
          expectedDbSpan({
            name: 'SELECT "User"; SELECT "User"',
            statement: 'SELECT "email" FROM "User"; SELECT "name" FROM "User"',
            batchSize: 2,
          }),
          expectedDbSpan({
            name: 'SELECT "does_not_exist_table"',
            statement: 'SELECT * FROM "does_not_exist_table"',
            status: 'error',
          }),
          expectedDbSpan({ name: 'DROP TABLE "User"', statement: 'DROP TABLE "User"' }),
        ]);
      });
    });
  });

  describe('websocket driver', () => {
    createEsmAndCjsTests(__dirname, 'scenario-ws.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('instruments `Client` queries', { timeout: 90_000 }, async () => {
        const runner = createTestRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('Test Span');

        await runner.start().completed();

        const spans = await spansPromise;
        const segment = spans.find(span => span.is_segment && span.name === 'Test Span');
        expect(segment).toBeDefined();

        const neonSpans = getNeonSpans(spans);
        expect(neonSpans.every(span => span.parent_span_id === segment!.span_id)).toBe(true);
        expect(neonSpans).toEqual([
          expectedDbSpan({ name: 'CREATE TABLE "User"', statement: CREATE_USER_TABLE_STATEMENT }),
          expectedDbSpan({ name: 'INSERT "User"', statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)' }),
          expectedDbSpan({ name: 'SELECT "User"', statement: 'SELECT * FROM "User"' }),
          expectedDbSpan({
            name: 'SELECT "does_not_exist_table"',
            statement: 'SELECT * FROM "does_not_exist_table"',
            status: 'error',
          }),
          expectedDbSpan({ name: 'DROP TABLE "User"', statement: 'DROP TABLE "User"' }),
        ]);
      });
    });
  });

  describe('websocket pool', () => {
    createEsmAndCjsTests(__dirname, 'scenario-pool.mjs', 'instrument.mjs', (createTestRunner, test) => {
      // On Bun and Deno the pool's connect callback runs outside the segment's async context, so
      // the queries it issues have no parent span.
      test.skipIf(RUNTIME !== 'node')('instruments `Pool` queries', { timeout: 90_000 }, async () => {
        const runner = createTestRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('Test Span');

        await runner.start().completed();

        const spans = await spansPromise;
        const segment = spans.find(span => span.is_segment && span.name === 'Test Span');
        expect(segment).toBeDefined();

        const neonSpans = getNeonSpans(spans);
        expect(neonSpans.every(span => span.parent_span_id === segment!.span_id)).toBe(true);
        expect(neonSpans).toEqual([
          expectedDbSpan({
            name: 'SELECT pg_catalog.pg_user',
            statement: 'SELECT "email", "name" FROM pg_catalog.pg_user LIMIT ?',
            status: 'error',
          }),
          expectedDbSpan({ name: 'SELECT pg_catalog.pg_user', statement: 'SELECT "usename" FROM pg_catalog.pg_user' }),
        ]);
      });
    });
  });
});
