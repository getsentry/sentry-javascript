import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _redisOptions, cacheResponseHook } from '../../../src/integrations/tracing/redis';
import {
  calculateCacheItemSize,
  GET_COMMANDS,
  getCacheKeySafely,
  SET_COMMANDS,
  shouldConsiderForCache,
} from '../../../src/utils/redisCache';

describe('Redis', () => {
  describe('cacheResponseHook', () => {
    let mockSpan: any;
    let originalRedisOptions: any;

    beforeEach(() => {
      mockSpan = {
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        updateName: vi.fn(),
        spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
      };

      originalRedisOptions = { ..._redisOptions };
    });

    afterEach(() => {
      vi.restoreAllMocks();
      // Reset redis options by clearing all properties first, then restoring original ones
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      Object.keys(_redisOptions).forEach(key => delete (_redisOptions as any)[key]);
      Object.assign(_redisOptions, originalRedisOptions);
    });

    describe('early returns', () => {
      it.each([
        { desc: 'no args', cmd: 'get', args: [], response: 'test' },
        { desc: 'unsupported command', cmd: 'exists', args: ['key'], response: 'test' },
        { desc: 'no cache prefixes', cmd: 'get', args: ['key'], response: 'test', options: {} },
        { desc: 'non-matching prefix', cmd: 'get', args: ['key'], response: 'test', options: { cachePrefixes: ['c'] } },
      ])('should always set sentry.origin but return early when $desc', ({ cmd, args, response, options = {} }) => {
        Object.assign(_redisOptions, options);

        cacheResponseHook(mockSpan, cmd, args, response);

        expect(mockSpan.setAttribute).toHaveBeenCalledWith('sentry.origin', 'auto.db.otel.redis');
        expect(mockSpan.setAttributes).not.toHaveBeenCalled();
        expect(mockSpan.updateName).not.toHaveBeenCalled();
      });
    });

    describe('span name truncation', () => {
      beforeEach(() => {
        Object.assign(_redisOptions, { cachePrefixes: ['cache:'] });
      });

      it('should not truncate span name when maxCacheKeyLength is not set', () => {
        cacheResponseHook(
          mockSpan,
          'mget',
          ['cache:very-long-key-name', 'cache:very-long-key-name-2', 'cache:very-long-key-name-3'],
          'value',
        );

        expect(mockSpan.updateName).toHaveBeenCalledWith(
          'cache:very-long-key-name, cache:very-long-key-name-2, cache:very-long-key-name-3',
        );
      });

      it('should truncate span name when maxCacheKeyLength is set', () => {
        Object.assign(_redisOptions, { maxCacheKeyLength: 10 });

        cacheResponseHook(mockSpan, 'get', ['cache:very-long-key-name'], 'value');

        expect(mockSpan.updateName).toHaveBeenCalledWith('cache:very...');
      });

      it('should truncate multiple keys joined with commas', () => {
        Object.assign(_redisOptions, { maxCacheKeyLength: 20 });

        cacheResponseHook(mockSpan, 'mget', ['cache:key1', 'cache:key2', 'cache:key3'], ['val1', 'val2', 'val3']);

        expect(mockSpan.updateName).toHaveBeenCalledWith('cache:key1, cache:ke...');
      });
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

    GET_COMMANDS.concat(SET_COMMANDS).forEach(command => {
      it(`should return true for ${command} command with matching prefix`, () => {
        const key = ['cache:test-key'];
        const result = shouldConsiderForCache(command, key, prefixes);
        expect(result).toBe(true);
      });
    });
  });

  describe('calculateCacheItemSize', () => {
    it('should return byte length for Buffer input', () => {
      const buffer = Buffer.from('test');
      const result = calculateCacheItemSize(buffer);
      expect(result).toBe(4);
    });

    it('should return string length for string input', () => {
      const str = 'test';
      const result = calculateCacheItemSize(str);
      expect(result).toBe(4);
    });

    it('should return number length for number input', () => {
      const num = 1234;
      const result = calculateCacheItemSize(num);
      expect(result).toBe(4);
    });

    it('should return 0 for null or undefined input', () => {
      const resultForNull = calculateCacheItemSize(null);
      const resultForUndefined = calculateCacheItemSize(undefined);
      expect(resultForNull).toBe(0);
      expect(resultForUndefined).toBe(0);
    });

    it('should return total size for array input', () => {
      const arr = ['test', Buffer.from('test'), 1234];
      const result = calculateCacheItemSize(arr);
      expect(result).toBe(12);
    });

    it('should return JSON string length for object input', () => {
      const obj = { key: 'value' };
      const result = calculateCacheItemSize(obj);
      expect(result).toBe(15);
    });

    it('should return undefined for circular objects', () => {
      const circularObject: { self?: any } = {};
      circularObject.self = circularObject; // This creates a circular reference
      const result = calculateCacheItemSize(circularObject);
      expect(result).toBeUndefined();
    });
  });
});
