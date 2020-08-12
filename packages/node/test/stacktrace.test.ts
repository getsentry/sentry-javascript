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

describe('stacktrace.ts', () => {
  test('testObjectInMethodName', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'Error: Foo\n' +
      '    at [object Object].global.every [as _onTimeout] (/Users/hoitz/develop/test.coffee:36:3)\n' +
      '    at Timer.listOnTimeout [as ontimeout] (timers.js:110:15)\n';

    const trace = stacktrace.parse(err as Error);

    expect(trace[0].fileName).toEqual('/Users/hoitz/develop/test.coffee');
    expect(trace[1].fileName).toEqual('timers.js');
  });

  test('testBasic', () => {
    const trace = stacktrace.parse(testBasic());

    expect(trace[0].fileName).toEqual(__filename);
    expect(trace[0].functionName).toEqual('testBasic');
  });

  test('testWrapper', () => {
    const trace = stacktrace.parse(testWrapper());

    expect(trace[0].functionName).toEqual('testBasic');
    expect(trace[1].functionName).toEqual('testWrapper');
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

    expect(trace.length).toEqual(2);
  });

  test('testTraceWitoutColumnNumbers', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.fn (/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js:6)\n' +
      '    at Test.run (/Users/felix/code/node-fast-or-slow/lib/test.js:45)';

    const trace = stacktrace.parse(err as Error);

    expect(trace[0].fileName).toEqual('/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js');
    expect(trace[0].lineNumber).toEqual(6);
    expect(trace[0].columnNumber).toEqual(null);
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
    const nativeCallSite = trace[4];

    expect(nativeCallSite.fileName).toEqual(null);
    expect(nativeCallSite.functionName).toEqual('Array.0');
    expect(nativeCallSite.typeName).toEqual('Array');
    expect(nativeCallSite.methodName).toEqual('0');
    expect(nativeCallSite.lineNumber).toEqual(null);
    expect(nativeCallSite.columnNumber).toEqual(null);
    expect(nativeCallSite.native).toEqual(true);
  });

  test('testStackWithFileOnly', () => {
    const err: { [key: string]: any } = {};
    err.stack = 'AssertionError: true == false\n' + '   at /Users/felix/code/node-fast-or-slow/lib/test_case.js:80:10';

    const trace = stacktrace.parse(err as Error);
    const callSite = trace[0];

    expect(callSite.fileName).toEqual('/Users/felix/code/node-fast-or-slow/lib/test_case.js');
    expect(callSite.functionName).toEqual(null);
    expect(callSite.typeName).toEqual(null);
    expect(callSite.methodName).toEqual(null);
    expect(callSite.lineNumber).toEqual(80);
    expect(callSite.columnNumber).toEqual(10);
    expect(callSite.native).toEqual(false);
  });

  test('testStackWithMultilineMessage', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\nAnd some more shit\n' +
      '   at /Users/felix/code/node-fast-or-slow/lib/test_case.js:80:10';

    const trace = stacktrace.parse(err as Error);
    const callSite = trace[0];

    expect(callSite.fileName).toEqual('/Users/felix/code/node-fast-or-slow/lib/test_case.js');
  });

  test('testStackWithAnonymousFunctionCall', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: expected [] to be arguments\n' +
      '    at Assertion.prop.(anonymous function) (/Users/den/Projects/should.js/lib/should.js:60:14)\n';

    const trace = stacktrace.parse(err as Error);
    const callSite0 = trace[0];

    expect(callSite0.fileName).toEqual('/Users/den/Projects/should.js/lib/should.js');
    expect(callSite0.functionName).toEqual('Assertion.prop.(anonymous function)');
    expect(callSite0.typeName).toEqual('Assertion.prop');
    expect(callSite0.methodName).toEqual('(anonymous function)');
    expect(callSite0.lineNumber).toEqual(60);
    expect(callSite0.columnNumber).toEqual(14);
    expect(callSite0.native).toEqual(false);
  });

  test('testTraceBracesInPath', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.run (/Users/felix (something)/code/node-fast-or-slow/lib/test.js:45:10)\n' +
      '    at TestCase.run (/Users/felix (something)/code/node-fast-or-slow/lib/test_case.js:61:8)\n';

    const trace = stacktrace.parse(err as Error);

    expect(trace.length).toEqual(2);
    expect(trace[0].fileName).toEqual('/Users/felix (something)/code/node-fast-or-slow/lib/test.js');
  });
});
