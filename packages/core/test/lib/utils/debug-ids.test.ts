import { beforeEach, describe, expect, it } from 'vitest';
import { nodeStackLineParser } from '../../../src';
import { clearDebugIdCache, getDebugImagesForResources, getFilenameToDebugIdMap } from '../../../src/utils/debug-ids';
import { createStackParser } from '../../../src/utils/stacktrace';

const nodeStackParser = createStackParser(nodeStackLineParser());

describe('getDebugImagesForResources', () => {
  beforeEach(() => {
    // Clear any existing debug ID maps
    delete (globalThis as any)._sentryDebugIds;
    delete (globalThis as any)._debugIds;
    clearDebugIdCache();
  });

  it('should return debug images for resources without file:// prefix', () => {
    // Setup debug IDs
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
    };

    const resources = ['/var/task/index.js'];
    const images = getDebugImagesForResources(nodeStackParser, resources);

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
    const images = getDebugImagesForResources(nodeStackParser, resources);

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
    const images = getDebugImagesForResources(nodeStackParser, resources);

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
    const images = getDebugImagesForResources(nodeStackParser, resources);

    expect(images).toHaveLength(0);
  });

  it('should return empty array when no debug IDs are registered', () => {
    const resources = ['file:///var/task/index.js'];
    const images = getDebugImagesForResources(nodeStackParser, resources);

    expect(images).toHaveLength(0);
  });

  it('should handle empty resource paths array', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
    };

    const resources: string[] = [];
    const images = getDebugImagesForResources(nodeStackParser, resources);

    expect(images).toHaveLength(0);
  });

  it('should handle Windows paths with file:// prefix', () => {
    // Stack parser normalizes Windows paths: file:///C:/foo.js -> C:/foo.js
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (C:/Users/dev/project/index.js:1:1)': 'debug-id-win-123',
    };

    // V8 profiler returns Windows paths with file:// prefix
    const resources = ['file:///C:/Users/dev/project/index.js'];
    const images = getDebugImagesForResources(nodeStackParser, resources);

    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({
      type: 'sourcemap',
      code_file: 'file:///C:/Users/dev/project/index.js',
      debug_id: 'debug-id-win-123',
    });
  });

  it('should handle Windows paths without file:// prefix', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (C:/Users/dev/project/index.js:1:1)': 'debug-id-win-123',
    };

    const resources = ['C:/Users/dev/project/index.js'];
    const images = getDebugImagesForResources(nodeStackParser, resources);

    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({
      type: 'sourcemap',
      code_file: 'C:/Users/dev/project/index.js',
      debug_id: 'debug-id-win-123',
    });
  });
});

describe('getFilenameToDebugIdMap', () => {
  beforeEach(() => {
    delete (globalThis as any)._sentryDebugIds;
    delete (globalThis as any)._debugIds;
    clearDebugIdCache();
  });

  it('should return empty object when no debug IDs are registered', () => {
    const map = getFilenameToDebugIdMap(nodeStackParser);
    expect(map).toEqual({});
  });

  it('should build map from _sentryDebugIds', () => {
    (globalThis as any)._sentryDebugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'debug-id-123',
      'at anotherFunction (/var/task/utils.js:10:5)': 'debug-id-456',
    };

    const map = getFilenameToDebugIdMap(nodeStackParser);

    expect(map).toEqual({
      '/var/task/index.js': 'debug-id-123',
      '/var/task/utils.js': 'debug-id-456',
    });
  });

  it('should build map from native _debugIds', () => {
    (globalThis as any)._debugIds = {
      'at mockFunction (/var/task/index.js:1:1)': 'native-debug-id-123',
    };

    const map = getFilenameToDebugIdMap(nodeStackParser);

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

    const map = getFilenameToDebugIdMap(nodeStackParser);

    expect(map['/var/task/index.js']).toBe('native-debug-id');
  });
});
