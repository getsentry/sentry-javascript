import { beforeEach, describe, expect, it } from 'vitest';
import type { StackParser } from '../../../src/types-hoist/stacktrace';
import { getDebugImagesForResources, getFilenameToDebugIdMap } from '../../../src/utils/debug-ids';

describe('getDebugImagesForResources', () => {
  const mockStackParser: StackParser = (stack: string) => {
    // Simple mock that extracts filename from a stack string
    const match = stack.match(/at .* \((.*?):\d+:\d+\)/);
    if (match) {
      return [{ filename: match[1], function: 'mockFunction', lineno: 1, colno: 1 }];
    }
    return [];
  };

  beforeEach(() => {
    // Clear any existing debug ID maps
    delete (globalThis as any)._sentryDebugIds;
    delete (globalThis as any)._debugIds;
  });

  it('should return debug images for resources without file:// prefix', () => {
    // Setup debug IDs
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
    };

    const resources = ['/var/task/index.js'];
    const images = getDebugImagesForResources(mockStackParser, resources);

    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({
      type: 'sourcemap',
      code_file: '/var/task/index.js',
      debug_id: 'debug-id-123',
    });
  });

  it('should return debug images for resources with file:// prefix', () => {
    // Setup debug IDs - the stack parser strips file:// when parsing
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
    };

    // V8 profiler returns resources WITH file:// prefix
    const resources = ['file:///var/task/index.js'];
    const images = getDebugImagesForResources(mockStackParser, resources);

    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({
      type: 'sourcemap',
      code_file: 'file:///var/task/index.js',
      debug_id: 'debug-id-123',
    });
  });

  it('should handle mixed resources with and without file:// prefix', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
      'at anotherFunction (/var/task/utils.js:10:5)': 'debug-id-456',
    };

    const resources = ['file:///var/task/index.js', '/var/task/utils.js'];
    const images = getDebugImagesForResources(mockStackParser, resources);

    expect(images).toHaveLength(2);
    expect(images[0]).toEqual({
      type: 'sourcemap',
      code_file: 'file:///var/task/index.js',
      debug_id: 'debug-id-123',
    });
    expect(images[1]).toEqual({
      type: 'sourcemap',
      code_file: '/var/task/utils.js',
      debug_id: 'debug-id-456',
    });
  });

  it('should return empty array when no debug IDs match', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
    };

    const resources = ['file:///var/task/other.js'];
    const images = getDebugImagesForResources(mockStackParser, resources);

    expect(images).toHaveLength(0);
  });

  it('should return empty array when no debug IDs are registered', () => {
    const resources = ['file:///var/task/index.js'];
    const images = getDebugImagesForResources(mockStackParser, resources);

    expect(images).toHaveLength(0);
  });

  it('should handle empty resource paths array', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
    };

    const resources: string[] = [];
    const images = getDebugImagesForResources(mockStackParser, resources);

    expect(images).toHaveLength(0);
  });
});

describe('getFilenameToDebugIdMap', () => {
  const mockStackParser: StackParser = (stack: string) => {
    const match = stack.match(/at .* \((.*?):\d+:\d+\)/);
    if (match) {
      return [{ filename: match[1], function: 'mockFunction', lineno: 1, colno: 1 }];
    }
    return [];
  };

  beforeEach(() => {
    delete (globalThis as any)._sentryDebugIds;
    delete (globalThis as any)._debugIds;
  });

  it('should return empty object when no debug IDs are registered', () => {
    const map = getFilenameToDebugIdMap(mockStackParser);
    expect(map).toEqual({});
  });

  it('should build map from _sentryDebugIds', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
      'at anotherFunction (/var/task/utils.js:10:5)': 'debug-id-456',
    };

    const map = getFilenameToDebugIdMap(mockStackParser);

    expect(map).toEqual({
      '/var/task/index.js': 'debug-id-123',
      '/var/task/utils.js': 'debug-id-456',
    });
  });

  it('should build map from native _debugIds', () => {
    (globalThis as any)._debugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'native-debug-id-123',
    };

    const map = getFilenameToDebugIdMap(mockStackParser);

    expect(map).toEqual({
      '/var/task/index.js': 'native-debug-id-123',
    });
  });

  it('should prioritize native _debugIds over _sentryDebugIds', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'sentry-debug-id',
    };
    (globalThis as any)._debugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'native-debug-id',
    };

    const map = getFilenameToDebugIdMap(mockStackParser);

    expect(map['/var/task/index.js']).toBe('native-debug-id');
  });
});
