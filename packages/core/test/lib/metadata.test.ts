import type { Event } from '@sentry/types';
import { createStackParser, GLOBAL_OBJ, nodeStackLineParser } from '@sentry/utils';

import { addMetadataToStackFrames, getMetadataForUrl, stripMetadataFromStackFrames } from '../../src/metadata';

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

  it('is parsed', () => {
    const metadata = getMetadataForUrl(parser, __filename);

    expect(metadata).toEqual({ team: 'frontend' });
  });

  it('is added and stripped from stack frames', () => {
    addMetadataToStackFrames(parser, event);

    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([
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

    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([
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
