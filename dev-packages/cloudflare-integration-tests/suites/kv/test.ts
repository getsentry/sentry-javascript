import {
  CACHE_HIT,
  CACHE_KEY,
  CACHE_OPERATION,
  DB_COLLECTION_NAME,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_ENVIRONMENT,
  SENTRY_IS_LOCALHOST,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_TRACE_LIFECYCLE,
  URL_PATH,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import { CACHE_OPERATION_NAMES, SDK_VERSION } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpansFromEnvelope } from '../../spanUtils';

it('emits cache.get for a KV read with key and hit attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const getSpans = spans.filter(span => span.name === CACHE_GET);

      expect(getSpans).toHaveLength(1);
      expect(getSpans[0]?.attributes).toEqual({
        [SENTRY_OP]: { type: 'string', value: CACHE_GET },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
        [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_GET] },
        [CACHE_KEY]: { type: 'array', value: ['get-key'] },
        [CACHE_HIT]: { type: 'boolean', value: true },
        [DB_OPERATION_NAME]: { type: 'string', value: 'get' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET' },
        [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan?.span_id },
        [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
        [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
        [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/get');
  await runner.completed();
});

it('emits cache.get with cache.hit false for a KV read of a missing key', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const getSpans = spans.filter(span => span.name === CACHE_GET);

      expect(getSpans).toHaveLength(1);
      expect(getSpans[0]?.attributes).toEqual({
        [SENTRY_OP]: { type: 'string', value: CACHE_GET },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
        [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_GET] },
        [CACHE_KEY]: { type: 'array', value: ['missing-key'] },
        [CACHE_HIT]: { type: 'boolean', value: false },
        [DB_OPERATION_NAME]: { type: 'string', value: 'get' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET' },
        [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan?.span_id },
        [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
        [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
        [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/get-miss');
  await runner.completed();
});

it('emits cache.get for a bulk KV read with all keys in cache.key', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const getSpans = spans.filter(span => span.name === CACHE_GET);

      expect(getSpans).toHaveLength(1);
      expect(getSpans[0]?.attributes).toEqual({
        [SENTRY_OP]: { type: 'string', value: CACHE_GET },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
        [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_GET] },
        [CACHE_KEY]: { type: 'array', value: ['bulk-a', 'bulk-b'] },
        [CACHE_HIT]: { type: 'boolean', value: true },
        [DB_OPERATION_NAME]: { type: 'string', value: 'get' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET' },
        [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan?.span_id },
        [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
        [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
        [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/bulk-get');
  await runner.completed();
});

it('emits cache.get for getWithMetadata', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const getSpans = spans.filter(span => span.name === CACHE_GET);

      expect(getSpans).toHaveLength(1);
      expect(getSpans[0]?.attributes).toEqual({
        [SENTRY_OP]: { type: 'string', value: CACHE_GET },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
        [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_GET] },
        [CACHE_KEY]: { type: 'array', value: ['metadata-key'] },
        [CACHE_HIT]: { type: 'boolean', value: true },
        [DB_OPERATION_NAME]: { type: 'string', value: 'getWithMetadata' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET' },
        [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan?.span_id },
        [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
        [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
        [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/get-with-metadata');
  await runner.completed();
});

it('emits cache.put for KV writes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const putSpans = spans.filter(span => span.name === CACHE_PUT);

      expect(putSpans).toHaveLength(1);
      expect(putSpans[0]?.attributes).toEqual({
        [SENTRY_OP]: { type: 'string', value: CACHE_PUT },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
        [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_PUT] },
        [CACHE_KEY]: { type: 'array', value: ['put-key'] },
        [DB_OPERATION_NAME]: { type: 'string', value: 'put' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET' },
        [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan?.span_id },
        [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
        [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
        [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/put');
  await runner.completed();
});

it('emits cache.remove for KV deletes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const removeSpans = spans.filter(span => span.name === CACHE_REMOVE);

      expect(removeSpans).toHaveLength(1);
      expect(removeSpans[0]?.attributes).toEqual({
        [SENTRY_OP]: { type: 'string', value: CACHE_REMOVE },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
        [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_REMOVE] },
        [CACHE_KEY]: { type: 'array', value: ['delete-key'] },
        [DB_OPERATION_NAME]: { type: 'string', value: 'delete' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET' },
        [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan?.span_id },
        [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
        [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
        [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/delete');
  await runner.completed();
});

it('emits cache.get without cache.key or cache.hit for KV list operations', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const getSpans = spans.filter(span => span.name === CACHE_GET);

      expect(getSpans).toHaveLength(1);
      expect(getSpans[0]?.attributes).toEqual({
        [SENTRY_OP]: { type: 'string', value: CACHE_GET },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.cache.cloudflare.kv' },
        [CACHE_OPERATION]: { type: 'string', value: CACHE_OPERATION_NAMES[CACHE_GET] },
        [DB_OPERATION_NAME]: { type: 'string', value: 'list' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'MY_KV' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'cloudflare-kv' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'GET' },
        [SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpan?.span_id },
        [SENTRY_SDK_NAME]: { type: 'string', value: 'sentry.javascript.cloudflare' },
        [SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
        [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: true },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/list');
  await runner.completed();
});

it("emits the KV spans of each request under that request's own segment span", async ({ signal }) => {
  const segmentTraceIds: string[] = [];
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);

      expect(segmentSpan?.attributes[URL_PATH]).toEqual({ type: 'string', value: '/kv/get' });
      expect(spans.filter(span => !span.is_segment)).toEqual([
        expect.objectContaining({
          name: CACHE_PUT,
          trace_id: segmentSpan?.trace_id,
          parent_span_id: segmentSpan?.span_id,
        }),
        expect.objectContaining({
          name: CACHE_GET,
          trace_id: segmentSpan?.trace_id,
          parent_span_id: segmentSpan?.span_id,
        }),
      ]);
      segmentTraceIds.push(segmentSpan!.trace_id);
    })
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);

      expect(segmentSpan?.attributes[URL_PATH]).toEqual({ type: 'string', value: '/kv/put' });
      expect(spans.filter(span => !span.is_segment)).toEqual([
        expect.objectContaining({
          name: CACHE_PUT,
          trace_id: segmentSpan?.trace_id,
          parent_span_id: segmentSpan?.span_id,
        }),
      ]);
      segmentTraceIds.push(segmentSpan!.trace_id);
    })
    .start(signal);

  await runner.makeRequest('get', '/kv/get');
  await runner.makeRequest('get', '/kv/put');
  await runner.completed();

  expect(segmentTraceIds).toHaveLength(2);
  expect(segmentTraceIds[0]).not.toBe(segmentTraceIds[1]);
});
