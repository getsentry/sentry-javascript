import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_RESPONSE_STATUS_CODE,
  DB_SYSTEM_NAME,
  ERROR_TYPE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_STATUS_MESSAGE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { RUNTIME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

// On Bun, `postgres` resolves to its ESM build through the `bun` export condition, so
// `require('postgres')` returns the module namespace instead of the `postgres` function.

describeWithDockerCompose('postgresjs auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const ORIGIN = 'auto.db.postgresjs';

  describe('basic', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'CREATE TABLE' },
            [DB_QUERY_TEXT]: {
              type: 'string',
              value:
                'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'CREATE TABLE "User"' },
          }),
          name: 'CREATE TABLE "User"',
          status: 'ok',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'INSERT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?)' },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
          }),
          name: 'INSERT "User"',
          status: 'ok',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'UPDATE' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'UPDATE "User" SET "name" = ? WHERE "email" = $1' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'UPDATE "User"' },
          }),
          name: 'UPDATE "User"',
          status: 'ok',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
          }),
          name: 'SELECT "User"',
          status: 'ok',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        // Parameterized query test - verifies that tagged template queries with interpolations
        // are properly reconstructed with $1, $2 placeholders which are PRESERVED per OTEL spec
        // (PostgreSQL $n placeholders indicate parameterized queries that don't leak sensitive data)
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1 AND "name" = $2' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
          }),
          name: 'SELECT "User"',
          status: 'ok',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * from generate_series(?,?) as x' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT generate_series' },
          }),
          name: 'SELECT generate_series',
          status: 'ok',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'DROP TABLE' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'DROP TABLE "User"' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'DROP TABLE "User"' },
          }),
          name: 'DROP TABLE "User"',
          status: 'ok',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
            [DB_RESPONSE_STATUS_CODE]: { type: 'string', value: '42P01' },
            [ERROR_TYPE]: { type: 'string', value: 'PostgresError' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
            [SENTRY_STATUS_MESSAGE]: { type: 'string', value: 'relation "User" does not exist' },
          }),
          name: 'SELECT "User"',
          status: 'error',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          trace_id: expect.any(String),
          is_segment: false,
        }),
        expect.objectContaining({
          name: 'DELETE "User"',
          is_segment: false,
          status: 'ok',
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_OPERATION_NAME]: { type: 'string', value: 'DELETE' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'DELETE FROM "User" WHERE "email" = $1' },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'DELETE "User"' },
          }),
        }),
        expect.objectContaining({
          name: 'INSERT "User"',
          is_segment: false,
          status: 'ok',
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_OPERATION_NAME]: { type: 'string', value: 'INSERT' },
            [DB_QUERY_TEXT]: {
              type: 'string',
              value: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?) RETURNING *',
            },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
          }),
        }),
      ]),
    };

    const EXPECTED_ERROR_EVENT = {
      event_id: expect.any(String),
      contexts: {
        trace: {
          trace_id: expect.any(String),
          span_id: expect.any(String),
        },
      },
      exception: {
        values: [
          {
            type: 'PostgresError',
            value: 'relation "User" does not exist',
            stacktrace: {
              frames: expect.arrayContaining([
                expect.objectContaining({
                  function: 'handle',
                  // Module differs between CJS (`postgres.cjs.src:connection`) and ESM (`postgres.src:connection`)
                  module: expect.stringMatching(/^postgres(\.cjs)?\.src:connection$/),
                  filename: expect.any(String),
                  lineno: expect.any(Number),
                  colno: expect.any(Number),
                }),
              ]),
            },
          },
        ],
      },
    };

    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test, mode) => {
      test.skipIf(RUNTIME === 'bun' && mode === 'cjs')(
        'should auto-instrument `postgres` package',
        { timeout: 60_000 },
        async () => {
          let receivedSpans: SerializedStreamedSpanContainer['items'] = [];
          let errorEvent: Event | undefined;
          await createTestRunner()
            .expect({
              span: container => {
                expect(container.items.find(span => span.is_segment)?.name).toBe('Test Transaction');
                receivedSpans = container.items;
              },
            })
            .expect({
              event: event => {
                errorEvent = event;
              },
            })
            // The error event is captured via an unhandled rejection processed on a later tick than
            // the spans, so the two envelopes can reach the transport in either order.
            .unordered()
            .start()
            .completed();
          expect({ items: receivedSpans }).toMatchObject(EXPECTED_SPANS);
          for (const span of receivedSpans.filter(span => span.attributes[SENTRY_OP]?.value === DB)) {
            expect(span.attributes[DB_QUERY_SUMMARY]).toEqual({ type: 'string', value: span.name });
          }
          expect(errorEvent).toMatchObject(EXPECTED_ERROR_EVENT);
        },
      );
    });
  });

  describe('requestHook', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'CREATE TABLE' },
            [DB_QUERY_TEXT]: {
              type: 'string',
              value:
                'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            },
            'custom.requestHook': { type: 'string', value: 'called' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'CREATE TABLE "User"' },
            'custom.requestHook.query': {
              type: 'string',
              value:
                'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            },
            'custom.requestHook.database': { type: 'string', value: 'test_db' },
            'custom.requestHook.host': { type: 'string', value: 'localhost' },
            'custom.requestHook.port': { type: 'string', value: '5444' },
          }),
          name: 'CREATE TABLE "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'INSERT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?)' },
            'custom.requestHook': { type: 'string', value: 'called' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
            'custom.requestHook.query': {
              type: 'string',
              value: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?)',
            },
            'custom.requestHook.database': { type: 'string', value: 'test_db' },
            'custom.requestHook.host': { type: 'string', value: 'localhost' },
            'custom.requestHook.port': { type: 'string', value: '5444' },
          }),
          name: 'INSERT "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
            'custom.requestHook': { type: 'string', value: 'called' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
            'custom.requestHook.query': { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
            'custom.requestHook.database': { type: 'string', value: 'test_db' },
            'custom.requestHook.host': { type: 'string', value: 'localhost' },
            'custom.requestHook.port': { type: 'string', value: '5444' },
          }),
          name: 'SELECT "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'DROP TABLE' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'DROP TABLE "User"' },
            'custom.requestHook': { type: 'string', value: 'called' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'DROP TABLE "User"' },
            'custom.requestHook.query': { type: 'string', value: 'DROP TABLE "User"' },
            'custom.requestHook.database': { type: 'string', value: 'test_db' },
            'custom.requestHook.host': { type: 'string', value: 'localhost' },
            'custom.requestHook.port': { type: 'string', value: '5444' },
          }),
          name: 'DROP TABLE "User"',
          status: 'ok',
          is_segment: false,
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-requestHook.mjs',
      'instrument-requestHook.mjs',
      (createTestRunner, test, mode) => {
        test.skipIf(RUNTIME === 'bun' && mode === 'cjs')(
          'should call requestHook when provided',
          { timeout: 60_000 },
          async () => {
            await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
          },
        );
      },
    );
  });

  describe('url initialization', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'CREATE TABLE' },
            [DB_QUERY_TEXT]: {
              type: 'string',
              value:
                'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'CREATE TABLE "User"' },
          }),
          name: 'CREATE TABLE "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'INSERT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?)' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
          }),
          name: 'INSERT "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
          }),
          name: 'SELECT "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'DELETE' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'DELETE FROM "User" WHERE "email" = $1' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'DELETE "User"' },
          }),
          name: 'DELETE "User"',
          status: 'ok',
          is_segment: false,
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-url.mjs', 'instrument.mjs', (createTestRunner, test, mode) => {
      test.skipIf(RUNTIME === 'bun' && mode === 'cjs')(
        'should instrument postgres package with URL initialization',
        { timeout: 90_000 },
        async () => {
          await createTestRunner().ignore('event').expect({ span: EXPECTED_SPANS }).start().completed();
        },
      );
    });
  });

  describe('sql.unsafe()', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'CREATE TABLE' },
            [DB_QUERY_TEXT]: {
              type: 'string',
              value: 'CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))',
            },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'CREATE TABLE "User"' },
          }),
          name: 'CREATE TABLE "User"',
          status: 'ok',
          is_segment: false,
        }),
        // sql.unsafe() with $1 placeholders - preserved per OTEL spec
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'INSERT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'INSERT INTO "User" ("email") VALUES ($1)' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
          }),
          name: 'INSERT "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'SELECT' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
          }),
          name: 'SELECT "User"',
          status: 'ok',
          is_segment: false,
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_NAMESPACE]: { type: 'string', value: 'test_db' },
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgres' },
            [DB_OPERATION_NAME]: { type: 'string', value: 'DROP TABLE' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'DROP TABLE "User"' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
            [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
            [SERVER_PORT]: { type: 'integer', value: 5444 },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'DROP TABLE "User"' },
          }),
          name: 'DROP TABLE "User"',
          status: 'ok',
          is_segment: false,
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-unsafe.mjs', 'instrument.mjs', (createTestRunner, test, mode) => {
      test.skipIf(RUNTIME === 'bun' && mode === 'cjs')(
        'should instrument sql.unsafe() queries',
        { timeout: 90_000 },
        async () => {
          // The last query fails on purpose, and its unhandled rejection also sends an error event, which can
          // arrive before the transaction.
          await createTestRunner().ignore('event').expect({ span: EXPECTED_SPANS }).start().completed();
        },
      );
    });
  });
});
