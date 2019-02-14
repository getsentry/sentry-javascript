import * as fs from 'fs';
import * as stacktrace from 'stack-trace';
import * as Parsers from '../src/parsers';
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
    test('parseStack with same file', done => {
      expect.assertions(1);
      let mockCalls = 0;
      Parsers.parseStack(frames).then(_ => {
        mockCalls = spy.mock.calls.length;
        Parsers.parseStack(frames).then(_1 => {
          // Calls to readFile shouldn't increase if there isn't a new error
          expect(spy).toHaveBeenCalledTimes(mockCalls);
          done();
        });
      });
    });

    test('parseStack with adding different file', done => {
      expect.assertions(2);
      let mockCalls = 0;
      let newErrorCalls = 0;
      Parsers.parseStack(frames).then(_ => {
        mockCalls = spy.mock.calls.length;
        Parsers.parseStack(stacktrace.parse(getError())).then(_1 => {
          newErrorCalls = spy.mock.calls.length;
          expect(newErrorCalls).toBeGreaterThan(mockCalls);
          Parsers.parseStack(stacktrace.parse(getError())).then(_2 => {
            expect(spy).toHaveBeenCalledTimes(newErrorCalls);
            done();
          });
        });
      });
    });
  });

  test('parseStack with no context', async () => {
    expect.assertions(1);
    return Parsers.parseStack(frames, { frameContextLines: 0 }).then(_ => {
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });
});
