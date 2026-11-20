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
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpansFromEnvelope } from '../../../spanUtils';

it('instruments client-web calls in a bundled Worker and leaves handled errors as spans', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);
  const spansPromise = runner.collectStreamedSpans(
    spans =>
      spans.some(span => span.is_segment) &&
      spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.clickhouse').length === 8,
  );

  expect(await runner.makeRequest('get', '/')).toEqual({ rows: [{ name: 'signup' }], requests: 8, failures: 4 });
  const spans = await spansPromise;
  const segment = spans.find(span => span.is_segment);
  const dbSpans = spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.clickhouse');

  for (const span of dbSpans) {
    expect(span.parent_span_id).toBe(segment?.span_id);
    expect(span.trace_id).toBe(segment?.trace_id);
    expect(span.attributes[SENTRY_OP]).toEqual({ type: 'string', value: DB });
    expect(span.attributes[SENTRY_KIND]).toEqual({ type: 'string', value: 'client' });
    expect(span.attributes[DB_SYSTEM_NAME]).toEqual({ type: 'string', value: 'clickhouse' });
    expect(span.attributes[DB_NAMESPACE]).toEqual({ type: 'string', value: 'tests' });
    expect(span.attributes[DB_USER]).toEqual({ type: 'string', value: 'test' });
    expect(span.attributes[SERVER_ADDRESS]).toEqual({ type: 'string', value: 'clickhouse.internal' });
    expect(span.attributes[SERVER_PORT]).toEqual({ type: 'integer', value: 8123 });
    expect(span.attributes[DB_QUERY_SUMMARY]?.value).toBe(span.name);
  }

  expect(
    dbSpans.map(span => ({
      name: span.name,
      status: span.status,
      operation: span.attributes[DB_OPERATION_NAME]?.value,
      text: span.attributes[DB_QUERY_TEXT]?.value,
      collection: span.attributes[DB_COLLECTION_NAME]?.value,
    })),
  ).toEqual([
    {
      name: 'SELECT events',
      status: 'ok',
      operation: 'SELECT',
      text: 'SELECT name FROM events WHERE name = ?',
      collection: undefined,
    },
    {
      name: 'INSERT events',
      status: 'ok',
      operation: 'INSERT',
      text: 'INSERT INTO TABLE events',
      collection: undefined,
    },
    {
      name: 'SELECT events',
      status: 'ok',
      operation: 'SELECT',
      text: 'SELECT count() FROM events FORMAT JSONEachRow',
      collection: undefined,
    },
    { name: 'INSERT events', status: 'ok', operation: 'INSERT', text: undefined, collection: 'events' },
    {
      name: 'SELECT does_not_exist',
      status: 'error',
      operation: 'SELECT',
      text: 'SELECT * FROM does_not_exist',
      collection: undefined,
    },
    {
      name: 'DROP TABLE does_not_exist',
      status: 'error',
      operation: 'DROP',
      text: 'DROP TABLE does_not_exist',
      collection: undefined,
    },
    {
      name: 'SELECT does_not_exist',
      status: 'error',
      operation: 'SELECT',
      text: 'SELECT * FROM does_not_exist FORMAT JSONEachRow',
      collection: undefined,
    },
    {
      name: 'INSERT does_not_exist',
      status: 'error',
      operation: 'INSERT',
      text: undefined,
      collection: 'does_not_exist',
    },
  ]);

  const envelopes = runner.getReceivedEnvelopes();
  expect(envelopes.some(envelope => envelope[1].some(item => item[0].type === 'event'))).toBe(false);
  expect(envelopes.flatMap(getSpansFromEnvelope).filter(span => span.attributes[SENTRY_OP]?.value === DB)).toHaveLength(
    8,
  );
});
