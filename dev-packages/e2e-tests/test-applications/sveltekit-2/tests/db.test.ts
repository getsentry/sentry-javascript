import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';

test('Instruments ioredis automatically', async ({ baseURL }) => {
  const traceSpansPromise = collectStreamedSpansUntilSegment('sveltekit-2', 'GET /db-ioredis');

  await fetch(`${baseURL}/db-ioredis`);

  const traceSpans = await traceSpansPromise;

  expect(traceSpans).toContainEqual(
    expect.objectContaining({
      name: 'set localhost:6379',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'db.query', type: 'string' },
        'sentry.origin': { value: 'auto.db.redis', type: 'string' },
        'db.system.name': { value: 'redis', type: 'string' },
        'db.operation.name': { value: 'set', type: 'string' },
        'db.query.text': { value: 'set test-key [1 other arguments]', type: 'string' },
      }),
    }),
  );
  expect(traceSpans).toContainEqual(
    expect.objectContaining({
      name: 'get localhost:6379',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'db.query', type: 'string' },
        'sentry.origin': { value: 'auto.db.redis', type: 'string' },
        'db.system.name': { value: 'redis', type: 'string' },
        'db.operation.name': { value: 'get', type: 'string' },
        'db.query.text': { value: 'get test-key', type: 'string' },
      }),
    }),
  );
});

test('Instruments mysql automatically', async ({ baseURL }) => {
  const traceSpansPromise = collectStreamedSpansUntilSegment('sveltekit-2', 'GET /db-mysql');

  await fetch(`${baseURL}/db-mysql`);

  const traceSpans = await traceSpansPromise;

  const mysqlSpan = (queryText: string) =>
    expect.objectContaining({
      name: 'SELECT',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'db', type: 'string' },
        'sentry.origin': { value: 'auto.db.mysql', type: 'string' },
        'db.system.name': { value: 'mysql', type: 'string' },
        'db.query.text': { value: queryText, type: 'string' },
        'db.query.summary': { value: 'SELECT', type: 'string' },
        'db.user': { value: 'root', type: 'string' },
        'db.connection_string': { value: expect.any(String), type: 'string' },
        'server.address': { value: expect.any(String), type: 'string' },
        'server.port': { value: 3306, type: 'integer' },
      }),
    });

  expect(traceSpans).toContainEqual(mysqlSpan('SELECT 1 + 1 AS solution'));
  expect(traceSpans).toContainEqual(mysqlSpan('SELECT NOW()'));
});
