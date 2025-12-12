import * as fs from 'node:fs';
import type { StackFrame } from '@sentry/core';
import { parseStackFrames } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  _contextLinesIntegration,
  MAX_CONTEXTLINES_COLNO,
  MAX_CONTEXTLINES_LINENO,
  resetFileContentCache,
} from '../../src/integrations/contextlines';
import { defaultStackParser } from '../../src/sdk/api';
import { getError } from '../helpers/error';

vi.mock('node:fs', async () => {
  const original = await vi.importActual('node:fs');
  return {
    ...original,
    createReadStream: original.createReadStream,
  };
});

describe('ContextLines', () => {
  let contextLines: ReturnType<typeof _contextLinesIntegration>;

  async function addContext(frames: StackFrame[]): Promise<void> {
    await contextLines.processEvent({ exception: { values: [{ stacktrace: { frames } }] } });
  }

  beforeEach(() => {
    contextLines = _contextLinesIntegration();
    resetFileContentCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('limits', () => {
    test(`colno above ${MAX_CONTEXTLINES_COLNO}`, async () => {
      expect.assertions(1);
      const frames: StackFrame[] = [
        {
          colno: MAX_CONTEXTLINES_COLNO + 1,
          filename: 'file:///var/task/index.js',
          lineno: 1,
          function: 'fxn1',
        },
      ];

      const readStreamSpy = vi.spyOn(fs, 'createReadStream');
      await addContext(frames);
      expect(readStreamSpy).not.toHaveBeenCalled();
    });

    test(`lineno above ${MAX_CONTEXTLINES_LINENO}`, async () => {
      expect.assertions(1);
      const frames: StackFrame[] = [
        {
          colno: 1,
          filename: 'file:///var/task/index.js',
          lineno: MAX_CONTEXTLINES_LINENO + 1,
          function: 'fxn1',
        },
      ];

      const readStreamSpy = vi.spyOn(fs, 'createReadStream');
      await addContext(frames);
      expect(readStreamSpy).not.toHaveBeenCalled();
    });
  });

  describe('lru file cache', () => {
    test('parseStack when file does not exist', async () => {
      expect.assertions(4);
      const frames: StackFrame[] = [
        {
          colno: 1,
          filename: 'file:///var/task/nonexistent.js',
          lineno: 1,
          function: 'fxn1',
        },
      ];

      const readStreamSpy = vi.spyOn(fs, 'createReadStream');
      await addContext(frames);

      expect(frames[0]!.pre_context).toBeUndefined();
      expect(frames[0]!.post_context).toBeUndefined();
      expect(frames[0]!.context_line).toBeUndefined();
      expect(readStreamSpy).toHaveBeenCalledTimes(1);
    });
    test('parseStack with same file', async () => {
      expect.assertions(1);

      const frames = parseStackFrames(defaultStackParser, new Error('test'));
      const readStreamSpy = vi.spyOn(fs, 'createReadStream');

      await addContext(frames);
      const numCalls = readStreamSpy.mock.calls.length;
      await addContext(frames);

      // Calls to `readFile` shouldn't increase if there isn't a new error to
      // parse whose stacktrace contains a file we haven't yet seen
      expect(readStreamSpy).toHaveBeenCalledTimes(numCalls);
    });

    test('parseStack with ESM module names', async () => {
      expect.assertions(1);

      const readStreamSpy = vi.spyOn(fs, 'createReadStream');
      const framesWithFilePath: StackFrame[] = [
        {
          colno: 1,
          filename: 'file:///var/task/index.js',
          lineno: 1,
          function: 'fxn1',
        },
      ];

      await addContext(framesWithFilePath);
      expect(readStreamSpy).toHaveBeenCalledTimes(1);
    });

    test('parseStack with adding different file', async () => {
      expect.assertions(1);
      const frames = parseStackFrames(defaultStackParser, new Error('test'));
      const readStreamSpy = vi.spyOn(fs, 'createReadStream');

      await addContext(frames);

      const numCalls = readStreamSpy.mock.calls.length;
      const parsedFrames = parseStackFrames(defaultStackParser, getError());
      await addContext(parsedFrames);

      const newErrorCalls = readStreamSpy.mock.calls.length;
      expect(newErrorCalls).toBeGreaterThan(numCalls);
    });

    test('parseStack with overlapping errors', async () => {
      function inner() {
        return new Error('inner');
      }
      function outer() {
        return inner();
      }

      const overlappingContextWithFirstError = parseStackFrames(defaultStackParser, outer());

      await addContext(overlappingContextWithFirstError);

      const innerFrame = overlappingContextWithFirstError[overlappingContextWithFirstError.length - 1]!;
      const outerFrame = overlappingContextWithFirstError[overlappingContextWithFirstError.length - 2]!;

      expect(innerFrame.context_line).toBe("        return new Error('inner');");
      expect(innerFrame.pre_context).toHaveLength(7);
      expect(innerFrame.post_context).toHaveLength(7);

      expect(outerFrame.context_line).toBe('        return inner();');
      expect(outerFrame.pre_context).toHaveLength(7);
      expect(outerFrame.post_context).toHaveLength(7);
    });

    test('parseStack with error on first line errors', async () => {
      const overlappingContextWithFirstError = parseStackFrames(defaultStackParser, getError());

      await addContext(overlappingContextWithFirstError);

      const errorFrame = overlappingContextWithFirstError.find(f => f.filename?.endsWith('error.ts'));

      if (!errorFrame) {
        throw new Error('Could not find error frame');
      }

      expect(errorFrame.context_line).toBe("  return new Error('mock error');");
      expect(errorFrame.pre_context).toHaveLength(2);
      expect(errorFrame.post_context).toHaveLength(1);
    });

    test('parseStack with duplicate files', async () => {
      expect.assertions(1);
      const readStreamSpy = vi.spyOn(fs, 'createReadStream');
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
      expect(readStreamSpy).toHaveBeenCalledTimes(1);
    });

    test('stack errors without lineno', async () => {
      expect.assertions(1);
      const readStreamSpy = vi.spyOn(fs, 'createReadStream');
      const framesWithDuplicateFiles: StackFrame[] = [
        {
          colno: 1,
          filename: '/var/task/index.js',
          lineno: undefined,
          function: 'fxn1',
        },
      ];

      await addContext(framesWithDuplicateFiles);
      expect(readStreamSpy).not.toHaveBeenCalled();
    });

    test('parseStack with no context', async () => {
      expect.assertions(1);
      contextLines = _contextLinesIntegration({ frameContextLines: 0 });
      const readStreamSpy = vi.spyOn(fs, 'createReadStream');

      const frames = parseStackFrames(defaultStackParser, new Error('test'));

      await addContext(frames);
      expect(readStreamSpy).not.toHaveBeenCalled();
    });
  });
});
