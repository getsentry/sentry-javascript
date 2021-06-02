import * as fs from 'fs';

import * as Parsers from '../src/parsers';
import * as stacktrace from '../src/stacktrace';
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
      void Parsers.parseStack(frames)
        .then(_ => {
          mockCalls = spy.mock.calls.length;
          void Parsers.parseStack(frames)
            .then(_1 => {
              // Calls to readFile shouldn't increase if there isn't a new error
              expect(spy).toHaveBeenCalledTimes(mockCalls);
              done();
            })
            .then(null, () => {
              // no-empty
            });
        })
        .then(null, () => {
          // no-empty
        });
    });

    test('parseStack with ESM module names', async () => {
      expect.assertions(1);

      const framesWithFilePath: stacktrace.StackFrame[] = [
        {
          columnNumber: 1,
          fileName: 'file:///var/task/index.js',
          functionName: 'module.exports../src/index.ts.fxn1',
          lineNumber: 1,
          methodName: 'fxn1',
          native: false,
          typeName: 'module.exports../src/index.ts',
        },
      ];
      return Parsers.parseStack(framesWithFilePath).then(_ => {
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });

    test('parseStack with adding different file', done => {
      expect.assertions(2);
      let mockCalls = 0;
      let newErrorCalls = 0;
      void Parsers.parseStack(frames)
        .then(_ => {
          mockCalls = spy.mock.calls.length;
          void Parsers.parseStack(stacktrace.parse(getError()))
            .then(_1 => {
              newErrorCalls = spy.mock.calls.length;
              expect(newErrorCalls).toBeGreaterThan(mockCalls);
              void Parsers.parseStack(stacktrace.parse(getError()))
                .then(_2 => {
                  expect(spy).toHaveBeenCalledTimes(newErrorCalls);
                  done();
                })
                .then(null, () => {
                  // no-empty
                });
            })
            .then(null, () => {
              // no-empty
            });
        })
        .then(null, () => {
          // no-empty
        });
    });
  });

  test('parseStack with duplicate files', async () => {
    expect.assertions(1);
    const framesWithDuplicateFiles: stacktrace.StackFrame[] = [
      {
        columnNumber: 1,
        fileName: '/var/task/index.js',
        functionName: 'module.exports../src/index.ts.fxn1',
        lineNumber: 1,
        methodName: 'fxn1',
        native: false,
        typeName: 'module.exports../src/index.ts',
      },
      {
        columnNumber: 2,
        fileName: '/var/task/index.js',
        functionName: 'module.exports../src/index.ts.fxn2',
        lineNumber: 2,
        methodName: 'fxn2',
        native: false,
        typeName: 'module.exports../src/index.ts',
      },
      {
        columnNumber: 3,
        fileName: '/var/task/index.js',
        functionName: 'module.exports../src/index.ts.fxn3',
        lineNumber: 3,
        methodName: 'fxn3',
        native: false,
        typeName: 'module.exports../src/index.ts',
      },
    ];
    return Parsers.parseStack(framesWithDuplicateFiles).then(_ => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('parseStack with no context', async () => {
    expect.assertions(1);
    return Parsers.parseStack(frames, { frameContextLines: 0 }).then(_ => {
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });
});
