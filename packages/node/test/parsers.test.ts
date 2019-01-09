// import { StackFrame } from '@sentry/types';
import * as fs from 'fs';
import * as stacktrace from 'stack-trace';
import { Parsers } from '../src';
import { getError } from './helper/error';

describe('parsers.ts', () => {
  let frames: stacktrace.StackFrame[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(fs, 'readFile');
    frames = stacktrace.parse(new Error('test'));
    Parsers.resetFileContentCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('lru file cache', () => {
    test('parseStack with same file', async () => {
      await Parsers.parseStack(frames);
      const mockCalls = spy.mock.calls.length;
      await Parsers.parseStack(frames);
      // Calls to readFile shouldn't increase if there isn't a new error
      expect(spy).toHaveBeenCalledTimes(mockCalls);
    });

    test('parseStack with adding different file', async () => {
      await Parsers.parseStack(frames);
      const mockCalls = spy.mock.calls.length;
      await Parsers.parseStack(stacktrace.parse(getError()));
      const newErrorCalls = spy.mock.calls.length;
      expect(newErrorCalls).toBeGreaterThan(mockCalls);
      await Parsers.parseStack(stacktrace.parse(getError()));
      expect(spy).toHaveBeenCalledTimes(newErrorCalls);
    });
  });

  test('parseStack with no context', async () => {
    await Parsers.parseStack(frames, { frameContextLines: 0 });
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
