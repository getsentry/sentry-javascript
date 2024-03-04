import * as fs from 'fs';
import type { Event, IntegrationFnResult, StackFrame } from '@sentry/types';
import { parseStackFrames } from '@sentry/utils';

import { contextLinesIntegration } from '../../src';
import { resetFileContentCache } from '../../src/integrations/contextlines';
import { defaultStackParser } from '../../src/sdk';
import { getError } from '../helper/error';

describe('ContextLines', () => {
  let readFileSpy: jest.SpyInstance;
  let contextLines: IntegrationFnResult;

  async function addContext(frames: StackFrame[]): Promise<void> {
    await (contextLines as IntegrationFnResult & { processEvent: (event: Event) => Promise<Event> }).processEvent({
      exception: { values: [{ stacktrace: { frames } }] },
    });
  }

  beforeEach(() => {
    readFileSpy = jest.spyOn(fs, 'readFile');
    contextLines = contextLinesIntegration();
    resetFileContentCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('lru file cache', () => {
    test('parseStack with same file', async () => {
      expect.assertions(1);

      const frames = parseStackFrames(defaultStackParser, new Error('test'));

      await addContext(Array.from(frames));

      const numCalls = readFileSpy.mock.calls.length;
      await addContext(frames);

      // Calls to `readFile` shouldn't increase if there isn't a new error to
      // parse whose stacktrace contains a file we haven't yet seen
      expect(readFileSpy).toHaveBeenCalledTimes(numCalls);
    });

    test('parseStack with ESM module names', async () => {
      expect.assertions(1);

      const framesWithFilePath: StackFrame[] = [
        {
          colno: 1,
          filename: 'file:///var/task/index.js',
          lineno: 1,
          function: 'fxn1',
        },
      ];

      await addContext(framesWithFilePath);
      expect(readFileSpy).toHaveBeenCalledTimes(1);
    });

    test('parseStack with adding different file', async () => {
      expect.assertions(1);
      const frames = parseStackFrames(defaultStackParser, new Error('test'));

      await addContext(frames);

      const numCalls = readFileSpy.mock.calls.length;
      const parsedFrames = parseStackFrames(defaultStackParser, getError());
      await addContext(parsedFrames);

      const newErrorCalls = readFileSpy.mock.calls.length;
      expect(newErrorCalls).toBeGreaterThan(numCalls);
    });

    test('parseStack with duplicate files', async () => {
      expect.assertions(1);
      const framesWithDuplicateFiles: StackFrame[] = [
        {
          colno: 1,
          filename: '/var/task/index.js',
          lineno: 1,
          function: 'fxn1',
        },
        {
          colno: 2,
          filename: '/var/task/index.js',
          lineno: 2,
          function: 'fxn2',
        },
        {
          colno: 3,
          filename: '/var/task/index.js',
          lineno: 3,
          function: 'fxn3',
        },
      ];

      await addContext(framesWithDuplicateFiles);
      expect(readFileSpy).toHaveBeenCalledTimes(1);
    });

    test('parseStack with no context', async () => {
      // eslint-disable-next-line deprecation/deprecation
      contextLines = contextLinesIntegration({ frameContextLines: 0 });

      expect.assertions(1);
      const frames = parseStackFrames(defaultStackParser, new Error('test'));

      await addContext(frames);
      expect(readFileSpy).toHaveBeenCalledTimes(0);
    });
  });

  test('does not attempt to readfile multiple times if it fails', async () => {
    expect.assertions(1);
    // eslint-disable-next-line deprecation/deprecation
    contextLines = contextLinesIntegration();

    readFileSpy.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory, open '/does/not/exist.js'");
    });

    await addContext([
      {
        colno: 1,
        filename: '/does/not/exist.js',
        lineno: 1,
        function: 'fxn1',
      },
    ]);
    await addContext([
      {
        colno: 1,
        filename: '/does/not/exist.js',
        lineno: 1,
        function: 'fxn1',
      },
    ]);

    expect(readFileSpy).toHaveBeenCalledTimes(1);
  });
});
