import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-7';

test('Instruments ioredis automatically', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /db-ioredis');

  await fetch(`${baseURL}/db-ioredis`);

  const spans = await spansPromise;
  const redisSpans = spans.filter(span => getSpanOp(span) === 'db.query');

  // With span streaming `db.query.text` carries the key, so the command span is named
  // `{db.operation.name} {server.address}:{server.port}` instead.
  expect(redisSpans).toContainEqual(
    expect.objectContaining({
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.db.redis', type: 'string' },
        'db.system.name': { value: 'redis', type: 'string' },
        'db.operation.name': { value: 'set', type: 'string' },
        'db.query.text': { value: 'set test-key [1 other arguments]', type: 'string' },
      }),
    }),
  );
  expect(redisSpans).toContainEqual(
    expect.objectContaining({
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.db.redis', type: 'string' },
        'db.system.name': { value: 'redis', type: 'string' },
        'db.operation.name': { value: 'get', type: 'string' },
        'db.query.text': { value: 'get test-key', type: 'string' },
      }),
    }),
  );
});

test('Instruments mysql automatically', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /db-mysql');

  await fetch(`${baseURL}/db-mysql`);

  const spans = await spansPromise;
  const mysqlSpans = spans.filter(span => getSpanOp(span) === 'db');

  // With span streaming the span name is the low-cardinality query summary; the statement stays in
  // `db.query.text`.
  for (const query of ['SELECT 1 + 1 AS solution', 'SELECT NOW()']) {
    expect(mysqlSpans).toContainEqual(
      expect.objectContaining({
        name: 'SELECT',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.origin': { value: 'auto.db.mysql', type: 'string' },
          'db.system.name': { value: 'mysql', type: 'string' },
          'db.query.text': { value: query, type: 'string' },
          'db.user': { value: 'root', type: 'string' },
          'db.connection_string': { value: expect.any(String), type: 'string' },
          'server.address': { value: expect.any(String), type: 'string' },
          'server.port': { value: 3306, type: 'integer' },
        }),
      }),
    );
  }
});
