import type { Envelope } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpansFromEnvelope } from '../../../spanUtils';

const flushMarkerMatcher = (envelope: Envelope): void => {
  const [, items] = envelope;
  const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

  expect(itemHeader.type).toBe('event');
  expect(itemBody.message).toBe('flush-marker');
};

it('instruments SQL exec operations on Durable Object storage', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);

      // `/exec` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.name).toBe('GET');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/exec' });

      const sqlSpans = spans.filter(
        span => span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]?.value === 'auto.db.cloudflare.durable_object.sql',
      );

      expect(sqlSpans).toHaveLength(3);
      expect(sqlSpans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'CREATE TABLE users',
            attributes: expect.objectContaining({
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'db.query' },
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.cloudflare.durable_object.sql' },
              'db.system.name': { type: 'string', value: 'cloudflare-durable-object-sql' },
              'db.operation.name': { type: 'string', value: 'exec' },
              'db.query.text': {
                type: 'string',
                value: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
              },
              'db.query.summary': { type: 'string', value: 'CREATE TABLE users' },
              'cloudflare.durable_object.query.bindings': { type: 'integer', value: 0 },
            }),
          }),
          expect.objectContaining({
            name: 'INSERT users',
            attributes: expect.objectContaining({
              'db.system.name': { type: 'string', value: 'cloudflare-durable-object-sql' },
              'db.operation.name': { type: 'string', value: 'exec' },
              'db.query.text': { type: 'string', value: 'INSERT INTO users (name) VALUES (?)' },
              'db.query.summary': { type: 'string', value: 'INSERT users' },
              'cloudflare.durable_object.query.bindings': { type: 'integer', value: 1 },
            }),
          }),
          expect.objectContaining({
            name: 'SELECT users',
            attributes: expect.objectContaining({
              'db.system.name': { type: 'string', value: 'cloudflare-durable-object-sql' },
              'db.operation.name': { type: 'string', value: 'exec' },
              'db.query.text': { type: 'string', value: 'SELECT * FROM users' },
              'db.query.summary': { type: 'string', value: 'SELECT users' },
              'cloudflare.durable_object.query.bindings': { type: 'integer', value: 0 },
            }),
          }),
        ]),
      );
    })
    .expect(flushMarkerMatcher)
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/exec');
  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});
