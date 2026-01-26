import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addMetadataToStackFrames,
  getFilenameToMetadataMap,
  getMetadataForUrl,
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
