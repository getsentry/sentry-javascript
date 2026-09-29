import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

const flushMarkerMatcher = (envelope: Envelope): void => {
  const [, items] = envelope;
  const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

  expect(itemHeader.type).toBe('event');
  expect(itemBody.message).toBe('flush-marker');
};

it('instruments sync KV operations on Durable Object storage', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('GET /');

      const kvSpans = spans.filter(span => getSpanOp(span) === 'db');

      expect(kvSpans).toHaveLength(4);
      expect(kvSpans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'durable_object_storage_kv_put',
            attributes: expect.objectContaining({
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'db' },
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.cloudflare.durable_object' },
              'db.system.name': { type: 'string', value: 'cloudflare-durable-object-sql' },
              'db.operation.name': { type: 'string', value: 'put' },
            }),
          }),
          expect.objectContaining({
            name: 'durable_object_storage_kv_get',
            attributes: expect.objectContaining({
              'db.system.name': { type: 'string', value: 'cloudflare-durable-object-sql' },
              'db.operation.name': { type: 'string', value: 'get' },
            }),
          }),
          expect.objectContaining({
            name: 'durable_object_storage_kv_list',
            attributes: expect.objectContaining({
              'db.system.name': { type: 'string', value: 'cloudflare-durable-object-sql' },
              'db.operation.name': { type: 'string', value: 'list' },
            }),
          }),
          expect.objectContaining({
            name: 'durable_object_storage_kv_delete',
            attributes: expect.objectContaining({
              'db.system.name': { type: 'string', value: 'cloudflare-durable-object-sql' },
              'db.operation.name': { type: 'string', value: 'delete' },
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
