import type { Envelope } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

const flushMarkerMatcher = (envelope: Envelope): void => {
  const [, items] = envelope;
  const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

  expect(itemHeader.type).toBe('event');
  expect(itemBody.message).toBe('flush-marker');
};

it('instruments SQL exec operations on Durable Object storage', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      const spans = transactionEvent?.spans ?? [];

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /exec',
        }),
      );

      const sqlSpans = (spans as Array<Record<string, unknown>>).filter(
        s => s.origin === 'auto.db.cloudflare.durable_object.sql',
      );

      expect(sqlSpans).toHaveLength(3);
      expect(sqlSpans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
            op: 'db.query',
            origin: 'auto.db.cloudflare.durable_object.sql',
            data: expect.objectContaining({
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.query',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'exec',
              'db.query.text': 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
              'cloudflare.durable_object.query.bindings': 0,
            }),
          }),
          expect.objectContaining({
            description: 'INSERT INTO users (name) VALUES (?)',
            op: 'db.query',
            origin: 'auto.db.cloudflare.durable_object.sql',
            data: expect.objectContaining({
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'exec',
              'db.query.text': 'INSERT INTO users (name) VALUES (?)',
              'cloudflare.durable_object.query.bindings': 1,
            }),
          }),
          expect.objectContaining({
            description: 'SELECT * FROM users',
            op: 'db.query',
            origin: 'auto.db.cloudflare.durable_object.sql',
            data: expect.objectContaining({
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'exec',
              'db.query.text': 'SELECT * FROM users',
              'cloudflare.durable_object.query.bindings': 0,
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
