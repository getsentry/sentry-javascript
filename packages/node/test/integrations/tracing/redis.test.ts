import {
  GET_COMMANDS,
  SET_COMMANDS,
  calculateCacheItemSize,
  getCacheKeySafely,
  shouldConsiderForCache,
} from '../../../src/utils/redisCache';

import { describe, expect, test } from 'vitest';

describe('Redis', () => {
  describe('getCacheKeySafely (single arg)', () => {
    test('should return an empty string if there are no command arguments', () => {
      const result = getCacheKeySafely('get', []);
      expect(result).toBe(undefined);
    });

    test('should return a string array representation of a single argument', () => {
      const cmdArgs = ['key1'];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    test('should return a string array representation of a single argument (uppercase)', () => {
      const cmdArgs = ['key1'];
      const result = getCacheKeySafely('GET', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    test('should return only the key for multiple arguments', () => {
      const cmdArgs = ['key1', 'the-value'];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    test('should handle number arguments', () => {
      const cmdArgs = [1, 'the-value'];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['1']);
    });

    test('should handle Buffer arguments', () => {
      const cmdArgs = [Buffer.from('key1'), Buffer.from('key2')];
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['key1']);
    });

    test('should return <unknown> if the arg type is not supported', () => {
      const cmdArgs = [Symbol('key1')];
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const result = getCacheKeySafely('get', cmdArgs);
      expect(result).toStrictEqual(['<unknown>']);
    });
  });

  describe('getCacheKeySafely (multiple args)', () => {
    test('should return a comma-separated string for multiple arguments with mget command', () => {
      const cmdArgs = ['key1', 'key2', 'key3'];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3']);
    });

    test('should handle Buffer arguments', () => {
      const cmdArgs = [Buffer.from('key1'), Buffer.from('key2')];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2']);
    });

    test('should handle array arguments', () => {
      const cmdArgs = [
        ['key1', 'key2'],
        ['key3', 'key4'],
      ];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3', 'key4']);
    });

    test('should handle mixed type arguments', () => {
      const cmdArgs = [Buffer.from('key1'), ['key2', 'key3'], [Buffer.from('key4'), 'key5', 'key6', 7, ['key8']]];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3', 'key4', 'key5', 'key6', '7', 'key8']);
    });

    test('should handle nested arrays with mixed types in arguments', () => {
      const cmdArgs = [
        ['key1', 'key2'],
        ['key3', 'key4', [Buffer.from('key5'), ['key6']]],
      ];
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['key1', 'key2', 'key3', 'key4', 'key5', 'key6']);
    });

    test('should return <unknown> if the arg type is not supported', () => {
      const cmdArgs = [Symbol('key1')];
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const result = getCacheKeySafely('mget', cmdArgs);
      expect(result).toStrictEqual(['<unknown>']);
    });
  });

  describe('calculateCacheItemSize', () => {
    test('should return byte length if response is a Buffer', () => {
      const response = Buffer.from('test');
      const result = calculateCacheItemSize(response);
      expect(result).toBe(response.byteLength);
    });

    test('should return string length if response is a string', () => {
      const response = 'test';
      const result = calculateCacheItemSize(response);
      expect(result).toBe(response.length);
    });

    test('should return length of string representation if response is a number', () => {
      const response = 1234;
      const result = calculateCacheItemSize(response);
      expect(result).toBe(response.toString().length);
    });

    test('should return 0 if response is null or undefined', () => {
      const response = null;
      const result = calculateCacheItemSize(response);
      expect(result).toBe(0);
    });

    test('should return length of JSON stringified response if response is an object', () => {
      const response = { key: 'value' };
      const result = calculateCacheItemSize(response);
      expect(result).toBe(JSON.stringify(response).length);
    });

    test('should return undefined if an error occurs', () => {
      const circularObject: { self?: any } = {};
      circularObject.self = circularObject; // This will cause JSON.stringify to throw an error
      const result = calculateCacheItemSize(circularObject);
      expect(result).toBeUndefined();
    });
  });

  describe('shouldConsiderForCache', () => {
    const prefixes = ['cache:', 'ioredis-cache:'];

    test('should return false for non-cache commands', () => {
      const command = 'EXISTS';
      const commandLowercase = 'exists';
      const key = ['cache:test-key'];
      const result1 = shouldConsiderForCache(command, key, prefixes);
      const result2 = shouldConsiderForCache(commandLowercase, key, prefixes);
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    test('should return true for cache commands with matching prefix', () => {
      const command = 'get';
      const key = ['cache:test-key'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(true);
    });

    test('should return false for cache commands without matching prefix', () => {
      const command = 'get';
      const key = ['test-key'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(false);
    });

    test('should return true for multiple keys with at least one matching prefix', () => {
      const command = 'mget';
      const key = ['test-key', 'cache:test-key'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(true);
    });

    test('should return false for multiple keys without any matching prefix', () => {
      const command = 'mget';
      const key = ['test-key', 'test-key2'];
      const result = shouldConsiderForCache(command, key, prefixes);
      expect(result).toBe(false);
    });

    GET_COMMANDS.concat(SET_COMMANDS).forEach(command => {
      test(`should return true for ${command} command with matching prefix`, () => {
        const key = ['cache:test-key'];
        const result = shouldConsiderForCache(command, key, prefixes);
        expect(result).toBe(true);
      });
    });
  });

  describe('calculateCacheItemSize', () => {
    test('should return byte length for Buffer input', () => {
      const buffer = Buffer.from('test');
      const result = calculateCacheItemSize(buffer);
      expect(result).toBe(4);
    });

    test('should return string length for string input', () => {
      const str = 'test';
      const result = calculateCacheItemSize(str);
      expect(result).toBe(4);
    });

    test('should return number length for number input', () => {
      const num = 1234;
      const result = calculateCacheItemSize(num);
      expect(result).toBe(4);
    });

    test('should return 0 for null or undefined input', () => {
      const resultForNull = calculateCacheItemSize(null);
      const resultForUndefined = calculateCacheItemSize(undefined);
      expect(resultForNull).toBe(0);
      expect(resultForUndefined).toBe(0);
    });

    test('should return total size for array input', () => {
      const arr = ['test', Buffer.from('test'), 1234];
      const result = calculateCacheItemSize(arr);
      expect(result).toBe(12);
    });

    test('should return JSON string length for object input', () => {
      const obj = { key: 'value' };
      const result = calculateCacheItemSize(obj);
      expect(result).toBe(15);
    });

    test('should return undefined for circular objects', () => {
      const circularObject: { self?: any } = {};
      circularObject.self = circularObject; // This creates a circular reference
      const result = calculateCacheItemSize(circularObject);
      expect(result).toBeUndefined();
    });
  });
});
