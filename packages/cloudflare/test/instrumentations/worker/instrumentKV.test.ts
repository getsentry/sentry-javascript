import type { KVNamespace } from '@cloudflare/workers-types';
import {
  CACHE_KEY,
  CACHE_OPERATION,
  DB_COLLECTION_NAME,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentKV } from '../../../src/instrumentations/worker/instrumentKV';
import { initTestClient, resetSdk } from '../../testUtils';

function createMockKVNamespace(): KVNamespace {
  return {
    get: vi.fn().mockResolvedValue('value'),
    getWithMetadata: vi.fn().mockResolvedValue({ value: 'value', metadata: null }),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
  } as unknown as KVNamespace;
}

describe('instrumentKV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetSdk();
  });

  const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

  test('forwards get with the type argument', async () => {
    const kv = createMockKVNamespace();
    const wrapped = instrumentKV(kv, 'MY_KV');

    const result = await wrapped.get('test-key', 'json');

    expect(result).toBe('value');
    expect(kv.get).toHaveBeenCalledWith('test-key', 'json');
  });

  test('starts a cache.get span with KV attributes', async () => {
    const kv = createMockKVNamespace();
    const wrapped = instrumentKV(kv, 'MY_KV');

    await wrapped.get('test-key');

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        name: CACHE_GET,
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: CACHE_GET,
          [SENTRY_ORIGIN]: 'auto.cache.cloudflare.kv',
          [CACHE_OPERATION]: SentryCore.CACHE_OPERATION_NAMES[CACHE_GET],
          [CACHE_KEY]: ['test-key'],
          [DB_OPERATION_NAME]: 'get',
          [DB_COLLECTION_NAME]: 'MY_KV',
          [DB_SYSTEM_NAME]: 'cloudflare-kv',
        },
      },
      expect.any(Function),
    );
  });

  test('handles bulk get without changing the underlying argument shape', async () => {
    const kv = createMockKVNamespace();
    const get = vi.fn().mockResolvedValue(
      new Map([
        ['first', 'one'],
        ['second', 'two'],
      ]),
    );
    kv.get = get as unknown as KVNamespace['get'];
    const wrapped = instrumentKV(kv, 'MY_KV');

    const keys = ['first', 'second'];
    const result = await wrapped.get(keys, 'text');

    expect(result).toBeInstanceOf(Map);
    expect(get).toHaveBeenCalledWith(keys, 'text');
    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        name: CACHE_GET,
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: CACHE_GET,
          [SENTRY_ORIGIN]: 'auto.cache.cloudflare.kv',
          [CACHE_OPERATION]: SentryCore.CACHE_OPERATION_NAMES[CACHE_GET],
          [CACHE_KEY]: ['first', 'second'],
          [DB_OPERATION_NAME]: 'get',
          [DB_COLLECTION_NAME]: 'MY_KV',
          [DB_SYSTEM_NAME]: 'cloudflare-kv',
        },
      },
      expect.any(Function),
    );
  });

  test('handles getWithMetadata as a cache read', async () => {
    const kv = createMockKVNamespace();
    const wrapped = instrumentKV(kv, 'MY_KV');

    await wrapped.getWithMetadata('test-key', 'json');

    expect(kv.getWithMetadata).toHaveBeenCalledWith('test-key', 'json');
    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        name: CACHE_GET,
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: CACHE_GET,
          [SENTRY_ORIGIN]: 'auto.cache.cloudflare.kv',
          [CACHE_OPERATION]: SentryCore.CACHE_OPERATION_NAMES[CACHE_GET],
          [CACHE_KEY]: ['test-key'],
          [DB_OPERATION_NAME]: 'getWithMetadata',
          [DB_COLLECTION_NAME]: 'MY_KV',
          [DB_SYSTEM_NAME]: 'cloudflare-kv',
        },
      },
      expect.any(Function),
    );
  });

  test('instruments put, delete, and list operations', async () => {
    const kv = createMockKVNamespace();
    const wrapped = instrumentKV(kv, 'MY_KV');

    await wrapped.put('put-key', 'value');
    await wrapped.delete('delete-key');
    await wrapped.list({ prefix: 'test-' });

    expect(startSpanSpy).toHaveBeenCalledTimes(3);
    expect(startSpanSpy).toHaveBeenNthCalledWith(
      1,
      {
        name: CACHE_PUT,
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: CACHE_PUT,
          [SENTRY_ORIGIN]: 'auto.cache.cloudflare.kv',
          [CACHE_OPERATION]: SentryCore.CACHE_OPERATION_NAMES[CACHE_PUT],
          [CACHE_KEY]: ['put-key'],
          [DB_OPERATION_NAME]: 'put',
          [DB_COLLECTION_NAME]: 'MY_KV',
          [DB_SYSTEM_NAME]: 'cloudflare-kv',
        },
      },
      expect.any(Function),
    );
    expect(startSpanSpy).toHaveBeenNthCalledWith(
      2,
      {
        name: CACHE_REMOVE,
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: CACHE_REMOVE,
          [SENTRY_ORIGIN]: 'auto.cache.cloudflare.kv',
          [CACHE_OPERATION]: SentryCore.CACHE_OPERATION_NAMES[CACHE_REMOVE],
          [CACHE_KEY]: ['delete-key'],
          [DB_OPERATION_NAME]: 'delete',
          [DB_COLLECTION_NAME]: 'MY_KV',
          [DB_SYSTEM_NAME]: 'cloudflare-kv',
        },
      },
      expect.any(Function),
    );
    expect(startSpanSpy).toHaveBeenNthCalledWith(
      3,
      {
        name: CACHE_GET,
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: CACHE_GET,
          [SENTRY_ORIGIN]: 'auto.cache.cloudflare.kv',
          [CACHE_OPERATION]: SentryCore.CACHE_OPERATION_NAMES[CACHE_GET],
          [DB_OPERATION_NAME]: 'list',
          [DB_COLLECTION_NAME]: 'MY_KV',
          [DB_SYSTEM_NAME]: 'cloudflare-kv',
        },
      },
      expect.any(Function),
    );
  });

  test('only creates spans when there is an active parent span', async () => {
    const client = initTestClient({ tracesSampleRate: 1 });
    const startedSpans: string[] = [];
    client.on('spanStart', span => startedSpans.push(SentryCore.spanToJSON(span).name));
    const wrapped = instrumentKV(createMockKVNamespace(), 'MY_KV');

    await wrapped.get('outside');
    await SentryCore.startSpan({ name: 'parent' }, () => wrapped.get('inside'));

    expect(startedSpans).toEqual(['parent', CACHE_GET]);
  });

  test('forwards unknown property accesses transparently', () => {
    const kv = Object.assign(createMockKVNamespace(), {
      customMethod: vi.fn().mockReturnValue('ok'),
    }) as KVNamespace & { customMethod: () => string };

    const wrapped = instrumentKV(kv, 'MY_KV');
    expect(wrapped.customMethod()).toBe('ok');
  });
});
