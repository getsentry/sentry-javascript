import {
  CACHE_KEY,
  CACHE_OPERATION,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  SENTRY_OP,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCacheResponseAttributes,
  getRedisCacheAttributes,
  calculateCacheItemSize,
  GET_COMMANDS,
  getCacheKeySafely,
  REMOVE_COMMANDS,
  SET_COMMANDS,
  shouldConsiderForCache,
} from '../../../src/integrations/redis/redis-cache';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

function setUpClient(traceLifecycle: 'stream' | 'static'): void {
  const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle, tracesSampleRate: 1 }));
  setCurrentClient(client);
  client.init();
}

describe('redis cache', () => {
  describe('getRedisCacheAttributes', () => {
    it.each([
      { desc: 'no args', cmd: 'get', args: [], options: {} },
      { desc: 'unsupported command', cmd: 'exists', args: ['key'], options: {} },
      { desc: 'no cache prefixes', cmd: 'get', args: ['key'], options: {} },
      { desc: 'non-matching prefix', cmd: 'get', args: ['key'], options: { cachePrefixes: ['c'] } },
    ])('should return undefined when $desc', ({ cmd, args, options }) => {
      expect(getRedisCacheAttributes(cmd, args, {}, options)).toBeUndefined();
    });

    it('should return cache op, key and network peer attributes for a matching key', () => {
      const result = getRedisCacheAttributes(
        'get',
        ['cache:test-key'],
        { [SERVER_ADDRESS]: 'localhost', [SERVER_PORT]: 6379 },
        { cachePrefixes: ['cache:'] },
      );

      expect(result).toStrictEqual({
        name: 'cache:test-key',
        attributes: {
          [SENTRY_OP]: 'cache.get',
          [CACHE_KEY]: ['cache:test-key'],
          [CACHE_OPERATION]: 'get',
          [NETWORK_PEER_ADDRESS]: 'localhost',
          [NETWORK_PEER_PORT]: 6379,
        },
      });
    });

    it('should omit network peer attributes when the db attributes have no server address', () => {
      const result = getRedisCacheAttributes('del', ['cache:test-key'], {}, { cachePrefixes: ['cache:'] });

      expect(result).toStrictEqual({
        name: 'cache:test-key',
        attributes: {
          [SENTRY_OP]: 'cache.remove',
          [CACHE_KEY]: ['cache:test-key'],
          [CACHE_OPERATION]: 'remove',
        },
      });
    });

    describe('span name truncation', () => {
      it('should not truncate span name when maxCacheKeyLength is not set', () => {
        const result = getRedisCacheAttributes(
          'mget',
          ['cache:very-long-key-name', 'cache:very-long-key-name-2', 'cache:very-long-key-name-3'],
          {},
          { cachePrefixes: ['cache:'] },
        );

        expect(result?.name).toBe('cache:very-long-key-name, cache:very-long-key-name-2, cache:very-long-key-name-3');
      });

      it('should truncate span name when maxCacheKeyLength is set', () => {
        const result = getRedisCacheAttributes(
          'get',
          ['cache:very-long-key-name'],
          {},
          {
            cachePrefixes: ['cache:'],
            maxCacheKeyLength: 10,
          },
        );

        expect(result?.name).toBe('cache:very...');
      });

      it('should truncate multiple keys joined with commas', () => {
        const result = getRedisCacheAttributes(
          'mget',
          ['cache:key1', 'cache:key2', 'cache:key3'],
          {},
          {
            cachePrefixes: ['cache:'],
            maxCacheKeyLength: 20,
          },
        );

        expect(result?.name).toBe('cache:key1, cache:ke...');
      });
    });

    describe('span names', () => {
      afterEach(() => {
        setCurrentClient(undefined as never);
      });

      it.each([
        { cmd: 'get', op: 'cache.get', operation: 'get' },
        { cmd: 'set', op: 'cache.put', operation: 'put' },
        { cmd: 'del', op: 'cache.remove', operation: 'remove' },
      ])('names a streamed $op span after the cache operation', ({ cmd, op, operation }) => {
        setUpClient('stream');

        const result = getRedisCacheAttributes(cmd, ['cache:user-42'], {}, { cachePrefixes: ['cache:'] });

        // The key is high cardinality, so it only lives on the attribute.
        expect(result).toStrictEqual({
          name: op,
          attributes: {
            [SENTRY_OP]: op,
            [CACHE_OPERATION]: operation,
            [CACHE_KEY]: ['cache:user-42'],
          },
        });
      });

      it('keeps the cache key as the span name when span streaming is off', () => {
        setUpClient('static');

        const result = getRedisCacheAttributes('get', ['cache:user-42'], {}, { cachePrefixes: ['cache:'] });

        expect(result?.name).toBe('cache:user-42');
        expect(result?.attributes).toEqual(expect.objectContaining({ [CACHE_OPERATION]: 'get' }));
      });
    });
  });

  describe('applyCacheResponseAttributes', () => {
    const cacheSpan = (op: string): SentrySpan =>
      new SentrySpan({ name: 'cache:test-key', attributes: { [SENTRY_OP]: op } });

    it('should set item size and cache hit on a cache.get span', () => {
      const span = cacheSpan('cache.get');
      applyCacheResponseAttributes(span, 'test-value');

      expect(spanToJSON(span).attributes).toMatchObject({ 'cache.item_size': 10, 'cache.hit': true });
    });

    it('should set a cache miss for an empty cache.get response', () => {
      const span = cacheSpan('cache.get');
      applyCacheResponseAttributes(span, null);

      expect(spanToJSON(span).attributes).toMatchObject({ 'cache.hit': false });
      expect(spanToJSON(span).attributes).not.toHaveProperty('cache.item_size');
    });

    it('should set only the item size on a cache.put span', () => {
      const span = cacheSpan('cache.put');
      applyCacheResponseAttributes(span, 'OK');

      expect(spanToJSON(span).attributes).toMatchObject({ 'cache.item_size': 2 });
      expect(spanToJSON(span).attributes).not.toHaveProperty('cache.hit');
    });

    it.each(['cache.remove', 'db.query'])('should not modify a %s span', op => {
      const span = cacheSpan(op);
      applyCacheResponseAttributes(span, 'test-value');

      expect(spanToJSON(span).attributes).not.toHaveProperty('cache.item_size');
      expect(spanToJSON(span).attributes).not.toHaveProperty('cache.hit');
    });
  });

  describe('getCacheKeySafely (single arg)', () => {
    it('should return an empty string if there are no command arguments', () => {
      const result = getCacheKeySafely('get', []);
      expect(result).toBe(undefined);
    });

    it('should return a string array representation of a single argument', () => {
      const cmdArgs = ['key1'];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    it('should return a string array representation of a single argument (uppercase)', () => {
      const cmdArgs = ['key1'];
      const result = getCacheKeySafely('GET', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    it('should return only the first key for commands that only accept a singe key (get)', () => {
      const cmdArgs = ['key1', 'the-value'];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    it('should handle number arguments', () => {
      const cmdArgs = [1, 'the-value'];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['1']);
    });

    it('should handle Buffer arguments', () => {
      const cmdArgs = [Buffer.from('key1'), Buffer.from('key2')];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    it('should return <unknown> if the arg type is not supported', () => {
      const cmdArgs = [Symbol('key1')];
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['<unknown>']);
    });
  });

  describe('getCacheKeySafely (multiple args)', () => {
    it('should return a comma-separated string for multiple arguments with mget command', () => {
      const cmdArgs = ['key1', 'key2', 'key3'];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3']);
    });

    it('should handle Buffer arguments', () => {
      const cmdArgs = [Buffer.from('key1'), Buffer.from('key2')];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2']);
    });

    it('should handle array arguments', () => {
      const cmdArgs = [
        ['key1', 'key2'],
        ['key3', 'key4'],
      ];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3', 'key4']);
    });

    it('should handle mixed type arguments', () => {
      const cmdArgs = [Buffer.from('key1'), ['key2', 'key3'], [Buffer.from('key4'), 'key5', 'key6', 7, ['key8']]];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3', 'key4', 'key5', 'key6', '7', 'key8']);
    });

    it('should handle nested arrays with mixed types in arguments', () => {
      const cmdArgs = [
        ['key1', 'key2'],
        ['key3', 'key4', [Buffer.from('key5'), ['key6']]],
      ];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3', 'key4', 'key5', 'key6']);
    });

    it('should return <unknown> if the arg type is not supported', () => {
      const cmdArgs = [Symbol('key1')];
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['<unknown>']);
    });
  });

  describe('calculateCacheItemSize', () => {
    it('should return byte length if response is a Buffer', () => {
      const response = Buffer.from('test');
      const result = calculateCacheItemSize(response);
      expect(result).toBe(response.byteLength);
    });

    it('should return string length if response is a string', () => {
      const response = 'test';
      const result = calculateCacheItemSize(response);
      expect(result).toBe(response.length);
    });

    it('should return length of string representation if response is a number', () => {
      const response = 1234;
      const result = calculateCacheItemSize(response);
      expect(result).toBe(response.toString().length);
    });

    it('should return 0 if response is null or undefined', () => {
      const response = null;
      const result = calculateCacheItemSize(response);
      expect(result).toBe(0);
    });

    it('should return length of JSON stringified response if response is an object', () => {
      const response = { key: 'value' };
      const result = calculateCacheItemSize(response);
      expect(result).toBe(JSON.stringify(response).length);
    });

    it('should return undefined if an error occurs', () => {
      const circularObject: { self?: any } = {};
      circularObject.self = circularObject; // This will cause JSON.stringify to throw an error
      const result = calculateCacheItemSize(circularObject);
      expect(result).toBeUndefined();
    });

    it('should return total size for array input', () => {
      const arr = ['test', Buffer.from('test'), 1234];
      const result = calculateCacheItemSize(arr);
      expect(result).toBe(12);
    });
  });

  describe('shouldConsiderForCache', () => {
    const prefixes = ['cache:', 'ioredis-cache:'];

    it('should return false for non-cache commands', () => {
      const command = 'EXISTS';
      const commandLowercase = 'exists';
      const key = ['cache:test-key'];
      const result1 = shouldConsiderForCache(command, key, prefixes);
      const result2 = shouldConsiderForCache(commandLowercase, key, prefixes);
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it('should return true for cache commands with matching prefix', () => {
      const command = 'get';
      const key = ['cache:test-key'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(true);
    });

    it('should return false for cache commands without matching prefix', () => {
      const command = 'get';
      const key = ['test-key'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(false);
    });

    it('should return true for multiple keys with at least one matching prefix', () => {
      const command = 'mget';
      const key = ['test-key', 'cache:test-key'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(true);
    });

    it('should return false for multiple keys without any matching prefix', () => {
      const command = 'mget';
      const key = ['test-key', 'test-key2'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(false);
    });

    GET_COMMANDS.concat(SET_COMMANDS, REMOVE_COMMANDS).forEach(command => {
      it(`should return true for ${command} command with matching prefix`, () => {
        const key = ['cache:test-key'];
        const result = shouldConsiderForCache(command, key, prefixes);
        expect(result).toBe(true);
      });
    });
  });
});
