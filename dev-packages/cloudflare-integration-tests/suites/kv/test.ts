import { expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpansFromEnvelope } from '../../spanUtils';

it('emits cache.get for a KV read with key and hit attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === 'cache.get');
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: 'cache.get' },
              'sentry.origin': { type: 'string', value: 'auto.cache.cloudflare.kv' },
              'cache.operation': { type: 'string', value: 'get' },
              'cache.key': { type: 'string', value: 'get-key' },
              'cache.hit': { type: 'boolean', value: true },
              'db.operation.name': { type: 'string', value: 'get' },
              'db.collection.name': { type: 'string', value: 'MY_KV' },
              'db.system.name': { type: 'string', value: 'cloudflare-kv' },
            }),
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/get');
  await runner.completed();
});

it('emits cache.get for a bulk KV read with all keys in cache.key', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(
        span => span.name === 'cache.get' && span.attributes['db.operation.name']?.value === 'get',
      );

      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              'cache.key': expect.objectContaining({ type: 'array' }),
              'cache.hit': { type: 'boolean', value: true },
            }),
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/bulk-get');
  await runner.completed();
});

it('emits cache.get for getWithMetadata', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(
        span => span.name === 'cache.get' && span.attributes['db.operation.name']?.value === 'getWithMetadata',
      );

      expect(spans).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'cache.key': { type: 'string', value: 'metadata-key' },
            'cache.hit': { type: 'boolean', value: true },
          }),
        }),
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/get-with-metadata');
  await runner.completed();
});

it('emits cache.put for KV writes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === 'cache.put');
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: 'cache.put' },
              'cache.operation': { type: 'string', value: 'put' },
              'cache.key': { type: 'string', value: 'put-key' },
              'db.operation.name': { type: 'string', value: 'put' },
            }),
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/put');
  await runner.completed();
});

it('emits cache.remove for KV deletes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === 'cache.remove');
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: 'cache.remove' },
              'cache.operation': { type: 'string', value: 'remove' },
              'cache.key': { type: 'string', value: 'delete-key' },
              'db.operation.name': { type: 'string', value: 'delete' },
            }),
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/delete');
  await runner.completed();
});

it('emits cache.get for KV list operations', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(
        span => span.name === 'cache.get' && span.attributes['db.operation.name']?.value === 'list',
      );

      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: 'cache.get' },
              'cache.operation': { type: 'string', value: 'get' },
              'db.operation.name': { type: 'string', value: 'list' },
            }),
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/list');
  await runner.completed();
});
