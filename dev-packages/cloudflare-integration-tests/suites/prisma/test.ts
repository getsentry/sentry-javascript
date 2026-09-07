import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpanOp } from '../../spanUtils';

beforeAll(() => {
  // Generate the Prisma client (including the WASM query engine used on Workers) before wrangler
  // bundles the worker. The generated client (output: "./generated") is gitignored.
  execSync(`yarn prisma generate --schema ${join(__dirname, 'schema.prisma')}`, { cwd: __dirname, stdio: 'inherit' });
}, 120_000);

it('captures Prisma spans for a D1 query via the @sentry/cloudflare prismaIntegration', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The request produces one segment span and sixteen children. Waiting for all seventeen rather
  // than for the segment: it ends last, but each envelope is its own request to the mock server, so
  // it can arrive before the envelope carrying the children this test asserts on.
  const spansPromise = runner.collectStreamedSpans(spansOfTrace => spansOfTrace.length === 17);

  await runner.makeRequest('get', '/users');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment);

  // `/users` is a raw URL, so the streamed segment name keeps the method only.
  expect(getSpanOp(segmentSpan!)).toBe('http.server');
  expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
  expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/users' });
  expect(segmentSpan?.status).toBe('ok');

  // Only the span shape is stable here - ids, timestamps, and parent ids are not.
  const childSpans = spans
    .filter(span => !span.is_segment)
    .map(span => ({ name: span.name, op: getSpanOp(span), origin: span.attributes['sentry.origin']?.value }));

  expect(childSpans).toHaveLength(16);
  expect(childSpans).toEqual(
    expect.arrayContaining([
      // Both D1 queries are named after their query summary rather than the full query text.
      { name: 'CREATE TABLE User', op: 'db.query', origin: 'auto.db.cloudflare.d1' },
      { name: 'SELECT `main`.`User`', op: 'db.query', origin: 'auto.db.cloudflare.d1' },
      { name: 'prisma:client:connect', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:client:load_engine', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:client:operation', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:client:serialize', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:engine:connect', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:engine:connection', op: 'db', origin: 'auto.db.prisma' },
      { name: 'prisma:engine:query', op: undefined, origin: 'auto.db.prisma' },
      { name: 'SELECT `main`.`User`', op: 'db', origin: 'auto.db.prisma' },
      { name: 'prisma:engine:js:query:args', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:engine:js:query:sql', op: 'db', origin: 'auto.db.prisma' },
      { name: 'prisma:engine:js:query:result', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:engine:serialize', op: undefined, origin: 'auto.db.prisma' },
      { name: 'prisma:engine:response_json_serialization', op: undefined, origin: 'auto.db.prisma' },
    ]),
  );
  expect(childSpans.filter(span => span.name === 'prisma:engine:connection')).toHaveLength(2);

  // The Prisma query reaches D1 with the trace context appended as a SQL comment. The two
  // `SELECT` spans share a name, so the D1 one is picked by its op.
  expect(
    spans.find(span => getSpanOp(span) === 'db.query' && span.name === 'SELECT `main`.`User`')?.attributes[
      'db.query.text'
    ],
  ).toEqual({
    type: 'string',
    value: expect.stringMatching(
      /^SELECT `main`\.`User`\.`id`, `main`\.`User`\.`email`, `main`\.`User`\.`name` FROM `main`\.`User` WHERE 1=1 LIMIT \? OFFSET \? \/\* traceparent='00-[\da-f]{32}-[\da-f]{16}-01' \*\/$/,
    ),
  });
});
