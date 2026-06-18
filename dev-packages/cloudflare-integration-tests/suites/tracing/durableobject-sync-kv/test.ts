import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { createRunner } from '../../../runner';

const flushMarkerMatcher = (envelope: Envelope): void => {
  const [, items] = envelope;
  const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

  expect(itemHeader.type).toBe('event');
  expect(itemBody.message).toBe('flush-marker');
};

it('instruments sync KV operations on Durable Object storage', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      const spans = transactionEvent?.spans ?? [];

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /',
        }),
      );

      expect(spans).toHaveLength(4);
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'durable_object_storage_kv_put',
            op: 'db',
            origin: 'auto.db.cloudflare.durable_object',
            data: expect.objectContaining({
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'put',
            }),
          }),
          expect.objectContaining({
            description: 'durable_object_storage_kv_get',
            op: 'db',
            origin: 'auto.db.cloudflare.durable_object',
            data: expect.objectContaining({
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'get',
            }),
          }),
          expect.objectContaining({
            description: 'durable_object_storage_kv_list',
            op: 'db',
            origin: 'auto.db.cloudflare.durable_object',
            data: expect.objectContaining({
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'list',
            }),
          }),
          expect.objectContaining({
            description: 'durable_object_storage_kv_delete',
            op: 'db',
            origin: 'auto.db.cloudflare.durable_object',
            data: expect.objectContaining({
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'delete',
            }),
          }),
        ]),
      );
    })
    .expect(flushMarkerMatcher)
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});
