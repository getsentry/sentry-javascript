/**
 * stack-trace - Parses node.js stack traces
 *
 * These tests were originally forked to fix this issue:
 * https://github.com/felixge/node-stack-trace/issues/31
 *
 * Mar 19,2019 - #4fd379e
 *
 * https://github.com/felixge/node-stack-trace/
 * @license MIT
 */

import * as stacktrace from '../src/stacktrace';

function testBasic() {
  return new Error('something went wrong');
}

function testWrapper() {
  return testBasic();
}

function evalWrapper() {
  return eval('testWrapper()');
}

describe('stacktrace.ts', () => {
  test('testBasic', () => {
    const trace = stacktrace.parse(testBasic());

    expect(trace[0].fileName).toEqual(__filename);
    expect(trace[0].functionName).toEqual('testBasic');
    expect(trace[0].lineNumber).toEqual(16);
    expect(trace[0].columnNumber).toEqual(10);
  });

  test('testWrapper', () => {
    const trace = stacktrace.parse(testWrapper());

    expect(trace[0].functionName).toEqual('testBasic');
    expect(trace[1].functionName).toEqual('testWrapper');
  });

  test('evalWrapper', () => {
    const trace = stacktrace.parse(evalWrapper());

    console.log(trace);
    expect(trace[0].functionName).toEqual('testBasic');
    expect(trace[1].functionName).toEqual('testWrapper');
    expect(trace[2].functionName).toEqual('eval');
  });

  test('testObjectInMethodName', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'Error: Foo\n' +
      '    at [object Object].global.every [as _onTimeout] (/Users/hoitz/develop/test.coffee:36:3)\n' +
      '    at Timer.listOnTimeout [as ontimeout] (timers.js:110:15)\n';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: 3,
        fileName: '/Users/hoitz/develop/test.coffee',
        functionName: '[object Object].global.every [as _onTimeout]',
        lineNumber: 36,
        methodName: 'every [as _onTimeout]',
        native: false,
        typeName: '[object Object].global',
      },
      {
        columnNumber: 15,
        fileName: 'timers.js',
        functionName: 'Timer.listOnTimeout [as ontimeout]',
        lineNumber: 110,
        methodName: 'listOnTimeout [as ontimeout]',
        native: false,
        typeName: 'Timer',
      },
    ]);
  });

  test('testNoStack', () => {
    const err = { stack: undefined };
    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([]);
  });

  test('testCorruptStack', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    fuck' +
      '    at Test.run (/Users/felix/code/node-fast-or-slow/lib/test.js:45:10)\n' +
      'oh no' +
      '    at TestCase.run (/Users/felix/code/node-fast-or-slow/lib/test_case.js:61:8)\n';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: 10,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test.js',
        functionName: 'Test.run',
        lineNumber: 45,
        methodName: 'run',
        native: false,
        typeName: 'Test',
      },
      {
        columnNumber: 8,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        functionName: 'TestCase.run',
        lineNumber: 61,
        methodName: 'run',
        native: false,
        typeName: 'TestCase',
      },
    ]);
  });

  test('testTraceWitoutColumnNumbers', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.fn (/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js:6)\n' +
      '    at Test.run (/Users/felix/code/node-fast-or-slow/lib/test.js:45)';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: null,
        fileName: '/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js',
        functionName: 'Test.fn',
        lineNumber: 6,
        methodName: 'fn',
        native: false,
        typeName: 'Test',
      },
      {
        columnNumber: null,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test.js',
        functionName: 'Test.run',
        lineNumber: 45,
        methodName: 'run',
        native: false,
        typeName: 'Test',
      },
    ]);
  });

  test('testStackWithNativeCall', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.fn (/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js:6:10)\n' +
      '    at Test.run (/Users/felix/code/node-fast-or-slow/lib/test.js:45:10)\n' +
      '    at TestCase.runNext (/Users/felix/code/node-fast-or-slow/lib/test_case.js:73:8)\n' +
      '    at TestCase.run (/Users/felix/code/node-fast-or-slow/lib/test_case.js:61:8)\n' +
      '    at Array.0 (native)\n' +
      '    at EventEmitter._tickCallback (node.js:126:26)';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: 10,
        fileName: '/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js',
        functionName: 'Test.fn',
        lineNumber: 6,
        methodName: 'fn',
        native: false,
        typeName: 'Test',
      },
      {
        columnNumber: 10,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test.js',
        functionName: 'Test.run',
        lineNumber: 45,
        methodName: 'run',
        native: false,
        typeName: 'Test',
      },
      {
        columnNumber: 8,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        functionName: 'TestCase.runNext',
        lineNumber: 73,
        methodName: 'runNext',
        native: false,
        typeName: 'TestCase',
      },
      {
        columnNumber: 8,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        functionName: 'TestCase.run',
        lineNumber: 61,
        methodName: 'run',
        native: false,
        typeName: 'TestCase',
      },
      {
        columnNumber: null,
        fileName: null,
        functionName: 'Array.0',
        lineNumber: null,
        methodName: '0',
        native: true,
        typeName: 'Array',
      },
      {
        columnNumber: 26,
        fileName: 'node.js',
        functionName: 'EventEmitter._tickCallback',
        lineNumber: 126,
        methodName: '_tickCallback',
        native: false,
        typeName: 'EventEmitter',
      },
    ]);
  });

  test('testStackWithFileOnly', () => {
    const err: { [key: string]: any } = {};
    err.stack = 'AssertionError: true == false\n' + '   at /Users/felix/code/node-fast-or-slow/lib/test_case.js:80:10';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: 10,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        functionName: null,
        lineNumber: 80,
        methodName: null,
        native: false,
        typeName: null,
      },
    ]);
  });

  test('testStackWithMultilineMessage', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\nAnd some more shit\n' +
      '   at /Users/felix/code/node-fast-or-slow/lib/test_case.js:80:10';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: 10,
        fileName: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        functionName: null,
        lineNumber: 80,
        methodName: null,
        native: false,
        typeName: null,
      },
    ]);
  });

  test('testStackWithAnonymousFunctionCall', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: expected [] to be arguments\n' +
      '    at Assertion.prop.(anonymous function) (/Users/den/Projects/should.js/lib/should.js:60:14)\n';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: 14,
        fileName: '/Users/den/Projects/should.js/lib/should.js',
        functionName: 'Assertion.prop.(anonymous function)',
        lineNumber: 60,
        methodName: '(anonymous function)',
        native: false,
        typeName: 'Assertion.prop',
      },
    ]);
  });

  test('testTraceBracesInPath', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.run (/Users/felix (something)/code/node-fast-or-slow/lib/test.js:45:10)\n' +
      '    at TestCase.run (/Users/felix (something)/code/node-fast-or-slow/lib/test_case.js:61:8)\n';

    const trace = stacktrace.parse(err as Error);

    expect(trace).toEqual([
      {
        columnNumber: 10,
        fileName: '/Users/felix (something)/code/node-fast-or-slow/lib/test.js',
        functionName: 'Test.run',
        lineNumber: 45,
        methodName: 'run',
        native: false,
        typeName: 'Test',
      },
      {
        columnNumber: 8,
        fileName: '/Users/felix (something)/code/node-fast-or-slow/lib/test_case.js',
        functionName: 'TestCase.run',
        lineNumber: 61,
        methodName: 'run',
        native: false,
        typeName: 'TestCase',
      },
    ]);
  });
});
