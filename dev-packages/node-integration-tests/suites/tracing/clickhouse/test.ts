import type { SerializedStreamedSpanContainer } from '@sentry/core';
import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
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
import { streamedAttribute as attr } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

const ORIGIN = 'auto.db.clickhouse';

const CONNECTION_ATTRIBUTES = {
  [SENTRY_OP]: attr(DB),
  [SENTRY_KIND]: attr('client'),
  [SENTRY_ORIGIN]: attr(ORIGIN),
  [DB_SYSTEM_NAME]: attr('clickhouse'),
  [DB_NAMESPACE]: attr('tests'),
  [DB_USER]: attr('test'),
  [SERVER_ADDRESS]: attr('localhost'),
  [SERVER_PORT]: attr(8123, 'integer'),
};

const CREATE_TABLE = 'CREATE TABLE IF NOT EXISTS events (id UInt32, name String) ENGINE = MergeTree ORDER BY id';

// One entry per instrumented call, in the order the scenario makes them.
const EXPECTED_SPANS = [
  { name: 'CREATE TABLE events', status: 'ok', operation: 'CREATE', text: CREATE_TABLE },
  { name: 'INSERT events', status: 'ok', operation: 'INSERT', text: undefined, collection: 'events' },
  { name: 'INSERT events', status: 'ok', operation: 'INSERT', text: 'INSERT INTO events' },
  // the string literal is sanitized out of the statement
  { name: 'SELECT events', status: 'ok', operation: 'SELECT', text: 'SELECT name FROM events WHERE name = ?' },
  // `{name:Type}` query parameters are kept as written
  { name: 'SELECT events', status: 'ok', operation: 'SELECT', text: 'SELECT name FROM events WHERE id = {id:UInt32}' },
  { name: 'SELECT events', status: 'ok', operation: 'SELECT', text: 'SELECT count() FROM events FORMAT JSONEachRow' },
  // handled failures, one per method
  { name: 'SELECT does_not_exist', status: 'error', operation: 'SELECT', text: 'SELECT * FROM does_not_exist' },
  { name: 'DROP TABLE does_not_exist', status: 'error', operation: 'DROP', text: 'DROP TABLE does_not_exist' },
  {
    name: 'SELECT does_not_exist',
    status: 'error',
    operation: 'SELECT',
    text: 'SELECT * FROM does_not_exist FORMAT JSONEachRow',
  },
  {
    name: 'INSERT does_not_exist',
    status: 'error',
    operation: 'INSERT',
    text: undefined,
    collection: 'does_not_exist',
  },
  { name: 'DROP TABLE events', status: 'ok', operation: 'DROP', text: 'DROP TABLE IF EXISTS events' },
];

function assertClickhouseSpans(container: SerializedStreamedSpanContainer): void {
  const segment = container.items.find(span => span.is_segment);
  expect(segment?.name).toBe('Test Span');

  const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN);
  for (const span of spans) {
    expect(span.parent_span_id).toBe(segment?.span_id);
    expect(span.attributes).toEqual(expect.objectContaining(CONNECTION_ATTRIBUTES));
  }

  expect(
    spans.map(span => ({
      name: span.name,
      status: span.status,
      operation: span.attributes[DB_OPERATION_NAME]?.value,
      text: span.attributes[DB_QUERY_TEXT]?.value,
      ...(span.attributes[DB_COLLECTION_NAME] ? { collection: span.attributes[DB_COLLECTION_NAME].value } : {}),
    })),
  ).toEqual(EXPECTED_SPANS);
  expect(spans.map(span => span.attributes[DB_QUERY_SUMMARY]?.value)).toEqual(EXPECTED_SPANS.map(span => span.name));
}

describeWithDockerCompose('clickhouse auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // The span container is the only envelope expected. A captured error would arrive as an `event`
  // envelope ahead of it and fail the run, so this also checks that handled failures aren't captured.
  describe('@clickhouse/client >=1.23', () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('instruments `query`, `command`, `exec` and `insert`', { timeout: 90_000 }, async () => {
        await createTestRunner().expect({ span: assertClickhouseSpans }).start().completed();
      });
    });
  });

  // Before 1.23.0 the client lives in the separate `@clickhouse/client-common` package.
  describe('@clickhouse/client <1.23', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('instruments `query`, `command`, `exec` and `insert`', { timeout: 90_000 }, async () => {
          await createTestRunner().expect({ span: assertClickhouseSpans }).start().completed();
        });
      },
      { additionalDependencies: { '@clickhouse/client': '1.22.0' } },
    );
  });
});
