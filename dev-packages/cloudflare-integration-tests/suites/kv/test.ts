import {
  CACHE_HIT,
  CACHE_KEY,
  CACHE_OPERATION,
  DB_COLLECTION_NAME,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import { CACHE_OPERATION_NAMES } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpansFromEnvelope } from '../../spanUtils';

it('emits cache.get for a KV read with key and hit attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === CACHE_GET);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.attributes).toEqual(
        expect.objectContaining({
          [SENTRY_OP]: { type: 'string', value: CACHE_GET },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
          [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_GET] },
          [CACHE_KEY]: { type: 'array', value: ['get-key'] },
          [CACHE_HIT]: { type: 'boolean', value: true },
          [DB_OPERATION_NAME]: { type: 'string', value: 'get' },
          [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
          [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        }),
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
        span => span.name === CACHE_GET && span.attributes[DB_OPERATION_NAME]?.value === 'get',
      );

      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              [CACHE_KEY]: expect.objectContaining({
                type: 'array',
                value: expect.arrayContaining(['bulk-a', 'bulk-b']),
              }),
              [CACHE_HIT]: { type: 'boolean', value: true },
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
        span => span.name === CACHE_GET && span.attributes[DB_OPERATION_NAME]?.value === 'getWithMetadata',
      );

      expect(spans).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            [CACHE_KEY]: { type: 'array', value: ['metadata-key'] },
            [CACHE_HIT]: { type: 'boolean', value: true },
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
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === CACHE_PUT);
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              [SENTRY_OP]: { type: 'string', value: CACHE_PUT },
              [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_PUT] },
              [CACHE_KEY]: { type: 'array', value: ['put-key'] },
              [DB_OPERATION_NAME]: { type: 'string', value: 'put' },
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
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === CACHE_REMOVE);
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              [SENTRY_OP]: { type: 'string', value: CACHE_REMOVE },
              [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_REMOVE] },
              [CACHE_KEY]: { type: 'array', value: ['delete-key'] },
              [DB_OPERATION_NAME]: { type: 'string', value: 'delete' },
            }),
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/delete');
  await runner.completed();
});

it('emits separate spans for separate KV requests', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === CACHE_GET);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.attributes).toEqual(
        expect.objectContaining({
          [DB_OPERATION_NAME]: { type: 'string', value: 'get' },
          [CACHE_KEY]: { type: 'array', value: ['get-key'] },
        }),
      );
    })
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(span => span.name === CACHE_PUT);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.attributes).toEqual(
        expect.objectContaining({
          [DB_OPERATION_NAME]: { type: 'string', value: 'put' },
          [CACHE_KEY]: { type: 'array', value: ['put-key'] },
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/get');
  await runner.makeRequest('get', '/kv/put');
  await runner.completed();
});

it('emits cache.get for KV list operations', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope).filter(
        span => span.name === CACHE_GET && span.attributes[DB_OPERATION_NAME]?.value === 'list',
      );

      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              [SENTRY_OP]: { type: 'string', value: CACHE_GET },
              [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_GET] },
              [DB_OPERATION_NAME]: { type: 'string', value: 'list' },
            }),
          }),
        ]),
      );
      expect(spans[0]?.attributes[CACHE_KEY]).toBeUndefined();
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/list');
  await runner.completed();
});
