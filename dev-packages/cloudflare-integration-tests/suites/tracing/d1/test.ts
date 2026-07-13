import { expect, it } from 'vitest';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { createRunner } from '../../../runner';

it('D1 database queries create spans with correct attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /init',
          spans: [
            {
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.query',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.d1',
                'db.system.name': 'cloudflare-d1',
                'db.operation.name': 'exec',
                'db.query.text': 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
              },
              description: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
              op: 'db.query',
              origin: 'auto.db.cloudflare.d1',
              parent_span_id: expect.any(String),
              span_id: expect.any(String),
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
            },
            {
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.query',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.d1',
                'db.system.name': 'cloudflare-d1',
                'db.operation.name': 'run',
                'db.query.text': 'INSERT INTO users (name) VALUES (?)',
                'cloudflare.d1.duration': expect.any(Number),
                'cloudflare.d1.rows_read': expect.any(Number),
                'cloudflare.d1.rows_written': expect.any(Number),
              },
              description: 'INSERT INTO users (name) VALUES (?)',
              op: 'db.query',
              origin: 'auto.db.cloudflare.d1',
              parent_span_id: expect.any(String),
              span_id: expect.any(String),
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
            },
          ],
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /query',
          spans: [
            {
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.query',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.d1',
                'db.system.name': 'cloudflare-d1',
                'db.operation.name': 'first',
                'db.query.text': 'SELECT * FROM users WHERE name = ?',
              },
              description: 'SELECT * FROM users WHERE name = ?',
              op: 'db.query',
              origin: 'auto.db.cloudflare.d1',
              parent_span_id: expect.any(String),
              span_id: expect.any(String),
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
            },
          ],
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/init');
  await runner.makeRequest('get', '/query');
  await runner.completed();
});
