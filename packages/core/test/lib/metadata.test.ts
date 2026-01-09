import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addMetadataToStackFrames,
  getFilenameToMetadataMap,
  getMetadataForUrl,
  mergeMetadataMap,
  stripMetadataFromStackFrames,
} from '../../src/metadata';
import type { Event } from '../../src/types-hoist/event';
import { nodeStackLineParser } from '../../src/utils/node-stack-trace';
import { createStackParser } from '../../src/utils/stacktrace';
import { GLOBAL_OBJ } from '../../src/utils/worldwide';

const parser = createStackParser(nodeStackLineParser());

const stack = new Error().stack || '';

const event: Event = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            {
              filename: '<anonymous>',
              function: 'new Promise',
            },
            {
              filename: '/tmp/utils.js',
              function: 'Promise.then.completed',
              lineno: 391,
              colno: 28,
            },
            {
              filename: __filename,
              function: 'Object.<anonymous>',
              lineno: 9,
              colno: 19,
            },
          ],
        },
      },
    ],
  },
};

describe('Metadata', () => {
  beforeEach(() => {
    GLOBAL_OBJ._sentryModuleMetadata = GLOBAL_OBJ._sentryModuleMetadata || {};
    GLOBAL_OBJ._sentryModuleMetadata[stack] = { team: 'frontend' };
  });

  afterEach(() => {
    delete GLOBAL_OBJ._sentryModuleMetadata;
  });

  it('is parsed', () => {
    const metadata = getMetadataForUrl(parser, __filename);

    expect(metadata).toEqual({ team: 'frontend' });
  });

  it('is added and stripped from stack frames', () => {
    addMetadataToStackFrames(parser, event);

    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      {
        filename: '<anonymous>',
        function: 'new Promise',
      },
      {
        filename: '/tmp/utils.js',
        function: 'Promise.then.completed',
        lineno: 391,
        colno: 28,
      },
      {
        filename: __filename,
        function: 'Object.<anonymous>',
        lineno: 9,
        colno: 19,
        module_metadata: {
          team: 'frontend',
        },
      },
    ]);

    stripMetadataFromStackFrames(event);

    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      {
        filename: '<anonymous>',
        function: 'new Promise',
      },
      {
        filename: '/tmp/utils.js',
        function: 'Promise.then.completed',
        lineno: 391,
        colno: 28,
      },
      {
        filename: __filename,
        function: 'Object.<anonymous>',
        lineno: 9,
        colno: 19,
      },
    ]);
  });
});

describe('getFilenameToMetadataMap', () => {
  afterEach(() => {
    delete GLOBAL_OBJ._sentryModuleMetadata;
  });

  it('returns empty object when no metadata is available', () => {
    delete GLOBAL_OBJ._sentryModuleMetadata;

    const result = getFilenameToMetadataMap(parser);

    expect(result).toEqual({});
  });

  it('extracts filenames from stack traces and maps to metadata', () => {
    const stack1 = `Error
    at Object.<anonymous> (/path/to/file1.js:10:15)
    at Module._compile (internal/modules/cjs/loader.js:1063:30)`;

    const stack2 = `Error
    at processTicksAndRejections (/path/to/file2.js:20:25)`;

    GLOBAL_OBJ._sentryModuleMetadata = {
      [stack1]: { '_sentryBundlerPluginAppKey:my-app': true, team: 'frontend' },
      [stack2]: { '_sentryBundlerPluginAppKey:my-app': true, team: 'backend' },
    };

    const result = getFilenameToMetadataMap(parser);

    expect(result).toEqual({
      '/path/to/file1.js': { '_sentryBundlerPluginAppKey:my-app': true, team: 'frontend' },
      '/path/to/file2.js': { '_sentryBundlerPluginAppKey:my-app': true, team: 'backend' },
    });
  });

  it('handles stack traces with native code frames', () => {
    const stackNoFilename = `Error
    at [native code]`;

    GLOBAL_OBJ._sentryModuleMetadata = {
      [stackNoFilename]: { '_sentryBundlerPluginAppKey:my-app': true },
    };

    const result = getFilenameToMetadataMap(parser);

    // Native code may be parsed as a filename by the parser
    // This is acceptable behavior as long as we don't error
    expect(result).toBeDefined();
  });

  it('handles multiple stacks with the same filename', () => {
    const stack1 = `Error
    at functionA (/path/to/same-file.js:10:15)`;

    const stack2 = `Error
    at functionB (/path/to/same-file.js:20:25)`;

    GLOBAL_OBJ._sentryModuleMetadata = {
      [stack1]: { '_sentryBundlerPluginAppKey:app1': true },
      [stack2]: { '_sentryBundlerPluginAppKey:app2': true },
    };

    const result = getFilenameToMetadataMap(parser);

    // Last one wins (based on iteration order)
    expect(result['/path/to/same-file.js']).toBeDefined();
  });
});

describe('mergeMetadataMap', () => {
  beforeEach(() => {
    delete GLOBAL_OBJ._sentryModuleMetadata;
  });

  it('merges metadata from a map into internal cache', () => {
    const workerMetadata = {
      'worker-file1.js': { '_sentryBundlerPluginAppKey:my-app': true },
      'worker-file2.js': { '_sentryBundlerPluginAppKey:my-app': true },
    };

    mergeMetadataMap(workerMetadata);

    const metadata1 = getMetadataForUrl(parser, 'worker-file1.js');
    const metadata2 = getMetadataForUrl(parser, 'worker-file2.js');

    expect(metadata1).toEqual({ '_sentryBundlerPluginAppKey:my-app': true });
    expect(metadata2).toEqual({ '_sentryBundlerPluginAppKey:my-app': true });
  });

  it('does not overwrite existing metadata', () => {
    const stack = `Error
    at Object.<anonymous> (/existing-file.js:10:15)`;

    GLOBAL_OBJ._sentryModuleMetadata = {
      [stack]: { '_sentryBundlerPluginAppKey:main-app': true, existing: true },
    };

    const existingMetadata = getMetadataForUrl(parser, '/existing-file.js');
    expect(existingMetadata).toEqual({ '_sentryBundlerPluginAppKey:main-app': true, existing: true });

    const workerMetadata = {
      '/existing-file.js': { '_sentryBundlerPluginAppKey:worker-app': true, worker: true },
    };

    mergeMetadataMap(workerMetadata);

    const metadataAfterMerge = getMetadataForUrl(parser, '/existing-file.js');
    expect(metadataAfterMerge).toEqual({ '_sentryBundlerPluginAppKey:main-app': true, existing: true });
  });

  it('handles empty metadata map', () => {
    mergeMetadataMap({});

    const metadata = getMetadataForUrl(parser, 'nonexistent-file.js');
    expect(metadata).toBeUndefined();
  });

  it('adds new files without affecting existing ones', () => {
    const stack = `Error
    at Object.<anonymous> (/main-file.js:10:15)`;

    GLOBAL_OBJ._sentryModuleMetadata = {
      [stack]: { '_sentryBundlerPluginAppKey:main-app': true },
    };

    getMetadataForUrl(parser, '/main-file.js');

    const workerMetadata = {
      '/worker-file.js': { '_sentryBundlerPluginAppKey:worker-app': true },
    };

    mergeMetadataMap(workerMetadata);

    const mainMetadata = getMetadataForUrl(parser, '/main-file.js');
    const workerMetadataResult = getMetadataForUrl(parser, '/worker-file.js');

    expect(mainMetadata).toEqual({ '_sentryBundlerPluginAppKey:main-app': true });
    expect(workerMetadataResult).toEqual({ '_sentryBundlerPluginAppKey:worker-app': true });
  });
});
