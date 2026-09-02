import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('Instruments ioredis automatically via build-time orchestrion', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    'solidstart',
    spans =>
      spans.some(
        span =>
          span.is_segment &&
          getSpanOp(span) === 'http.server' &&
          String(span.attributes['url.path']?.value ?? '').includes('db-ioredis'),
      ) &&
      spans.some(span => span.attributes['db.query.text']?.value === 'set test-key [1 other arguments]') &&
      spans.some(span => span.attributes['db.query.text']?.value === 'get test-key'),
  );

  await fetch(`${baseURL}/api/db-ioredis`);

  const spans = await spansPromise;
  // ioredis also emits handshake commands (SETINFO, INFO) as db.query spans.
  const redisSpans = spans.filter(
    span =>
      getSpanOp(span) === 'db.query' &&
      (span.attributes['db.operation.name']?.value === 'set' || span.attributes['db.operation.name']?.value === 'get'),
  );

  expect(redisSpans).toHaveLength(2);
  expect(redisSpans).toContainEqual(
    expect.objectContaining({
      name: 'set test-key [1 other arguments]',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db.query' },
        'sentry.origin': { type: 'string', value: 'auto.db.redis' },
        'db.system.name': { type: 'string', value: 'redis' },
        'db.operation.name': { type: 'string', value: 'set' },
        'db.query.text': { type: 'string', value: 'set test-key [1 other arguments]' },
      }),
    }),
  );
  expect(redisSpans).toContainEqual(
    expect.objectContaining({
      name: 'get test-key',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db.query' },
        'sentry.origin': { type: 'string', value: 'auto.db.redis' },
        'db.system.name': { type: 'string', value: 'redis' },
        'db.operation.name': { type: 'string', value: 'get' },
        'db.query.text': { type: 'string', value: 'get test-key' },
      }),
    }),
  );
});

test('Instruments mysql automatically via build-time orchestrion', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    'solidstart',
    spans =>
      spans.some(
        span =>
          span.is_segment &&
          getSpanOp(span) === 'http.server' &&
          String(span.attributes['url.path']?.value ?? '').includes('db-mysql'),
      ) && spans.filter(span => getSpanOp(span) === 'db').length >= 2,
  );

  await fetch(`${baseURL}/api/db-mysql`);

  const spans = await spansPromise;
  const mysqlSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.db.mysql');

  const firstQuery = mysqlSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  expect(firstQuery!.name).toBe('SELECT');
  expect(firstQuery!.status).toBe('ok');
  expect(firstQuery!.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'db' },
    'sentry.origin': { type: 'string', value: 'auto.db.mysql' },
    'db.system.name': { type: 'string', value: 'mysql' },
    'db.query.text': { type: 'string', value: 'SELECT 1 + 1 AS solution' },
    'db.user': { type: 'string', value: 'root' },
    'db.connection_string': { type: 'string', value: expect.any(String) },
    'server.address': { type: 'string', value: expect.any(String) },
    'server.port': { type: 'integer', value: 3306 },
  });

  const secondQuery = mysqlSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT NOW()');
  expect(secondQuery).toBeDefined();
  expect(secondQuery!.name).toBe('SELECT');
  expect(secondQuery!.status).toBe('ok');
  expect(secondQuery!.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'db' },
    'sentry.origin': { type: 'string', value: 'auto.db.mysql' },
    'db.system.name': { type: 'string', value: 'mysql' },
    'db.query.text': { type: 'string', value: 'SELECT NOW()' },
    'db.user': { type: 'string', value: 'root' },
    'db.connection_string': { type: 'string', value: expect.any(String) },
    'server.address': { type: 'string', value: expect.any(String) },
    'server.port': { type: 'integer', value: 3306 },
  });
});
