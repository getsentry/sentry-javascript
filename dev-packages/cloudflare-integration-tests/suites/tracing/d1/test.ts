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
                'cloudflare.d1.query_type': 'run',
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
                'cloudflare.d1.query_type': 'first',
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
