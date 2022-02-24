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

import { extractStackFromError } from '../src/eventbuilder';

function testBasic() {
  return new Error('something went wrong');
}

function testWrapper() {
  return testBasic();
}

function evalWrapper() {
  return eval('testWrapper()');
}

describe('Stack parsing', () => {
  test('test basic error', () => {
    const frames = extractStackFromError(testBasic());

    const last = frames.length - 1;
    expect(frames[last].filename).toEqual(__filename);
    expect(frames[last].function).toEqual('testBasic');
    expect(frames[last].lineno).toEqual(4);
    expect(frames[last].colno).toEqual(10);
  });

  test('test error with wrapper', () => {
    const frames = extractStackFromError(testWrapper());

    const last = frames.length - 1;
    expect(frames[last].function).toEqual('testBasic');
    expect(frames[last - 1].function).toEqual('testWrapper');
  });

  test('test error with eval wrapper', () => {
    const frames = extractStackFromError(evalWrapper());

    const last = frames.length - 1;
    expect(frames[last].function).toEqual('testBasic');
    expect(frames[last - 1].function).toEqual('testWrapper');
    expect(frames[last - 2].function).toEqual('eval');
  });

  test('parses object in fn name', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'Error: Foo\n' +
      '    at [object Object].global.every [as _onTimeout] (/Users/hoitz/develop/test.coffee:36:3)\n' +
      '    at Timer.listOnTimeout [as ontimeout] (timers.js:110:15)\n';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: 'timers.js',
        module: 'timers',
        function: 'Timer.listOnTimeout [as ontimeout]',
        lineno: 110,
        colno: 15,
        in_app: false,
      },
      {
        filename: '/Users/hoitz/develop/test.coffee',
        module: 'test.coffee',
        function: '[object Object].global.every [as _onTimeout]',
        lineno: 36,
        colno: 3,
        in_app: true,
      },
    ]);
  });

  test('parses undefined stack', () => {
    const err = { stack: undefined };
    const trace = extractStackFromError(err as Error);

    expect(trace).toEqual([]);
  });

  test('parses corrupt stack', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    fuck' +
      '    at Test.run (/Users/felix/code/node-fast-or-slow/lib/test.js:45:10)\n' +
      'oh no' +
      '    at TestCase.run (/Users/felix/code/node-fast-or-slow/lib/test_case.js:61:8)\n';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        module: 'test_case',
        function: 'TestCase.run',
        lineno: 61,
        colno: 8,
        in_app: true,
      },
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test.js',
        module: 'test',
        function: 'Test.run',
        lineno: 45,
        colno: 10,
        in_app: true,
      },
    ]);
  });

  test('parses with missing column numbers', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.fn (/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js:6)\n' +
      '    at Test.run (/Users/felix/code/node-fast-or-slow/lib/test.js:45)';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test.js',
        module: 'test',
        function: 'Test.run',
        lineno: 45,
        in_app: true,
      },
      {
        filename: '/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js',
        module: 'test-example',
        function: 'Test.fn',
        lineno: 6,
        in_app: true,
      },
    ]);
  });

  test('parses with native methods', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.fn (/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js:6:10)\n' +
      '    at Test.run (/Users/felix/code/node-fast-or-slow/lib/test.js:45:10)\n' +
      '    at TestCase.runNext (/Users/felix/code/node-fast-or-slow/lib/test_case.js:73:8)\n' +
      '    at TestCase.run (/Users/felix/code/node-fast-or-slow/lib/test_case.js:61:8)\n' +
      '    at Array.0 (native)\n' +
      '    at EventEmitter._tickCallback (node.js:126:26)';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: 'node.js',
        module: 'node',
        function: 'EventEmitter._tickCallback',
        lineno: 126,
        colno: 26,
        in_app: false,
      },
      {
        filename: '/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js',
        function: 'Array.0',
        in_app: false,
      },
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        module: 'test_case',
        function: 'TestCase.run',
        lineno: 61,
        colno: 8,
        in_app: true,
      },
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        module: 'test_case',
        function: 'TestCase.runNext',
        lineno: 73,
        colno: 8,
        in_app: true,
      },
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test.js',
        module: 'test',
        function: 'Test.run',
        lineno: 45,
        colno: 10,
        in_app: true,
      },
      {
        filename: '/Users/felix/code/node-fast-or-slow/test/fast/example/test-example.js',
        module: 'test-example',
        function: 'Test.fn',
        lineno: 6,
        colno: 10,
        in_app: true,
      },
    ]);
  });

  test('parses with file only', () => {
    const err: { [key: string]: any } = {};
    err.stack = 'AssertionError: true == false\n' + '   at /Users/felix/code/node-fast-or-slow/lib/test_case.js:80:10';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        module: 'test_case',
        function: 'undefined.<anonymous>',
        lineno: 80,
        colno: 10,
        in_app: true,
      },
    ]);
  });

  test('parses with multi line message', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\nAnd some more shit\n' +
      '   at /Users/felix/code/node-fast-or-slow/lib/test_case.js:80:10';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: '/Users/felix/code/node-fast-or-slow/lib/test_case.js',
        module: 'test_case',
        function: 'undefined.<anonymous>',
        lineno: 80,
        colno: 10,
        in_app: true,
      },
    ]);
  });

  test('parses with anonymous fn call', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: expected [] to be arguments\n' +
      '    at Assertion.prop.(anonymous function) (/Users/den/Projects/should.js/lib/should.js:60:14)\n';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: '/Users/den/Projects/should.js/lib/should.js',
        module: 'should',
        function: 'Assertion.prop.(anonymous function)',
        lineno: 60,
        colno: 14,
        in_app: true,
      },
    ]);
  });

  test('parses with braces in paths', () => {
    const err: { [key: string]: any } = {};
    err.stack =
      'AssertionError: true == false\n' +
      '    at Test.run (/Users/felix (something)/code/node-fast-or-slow/lib/test.js:45:10)\n' +
      '    at TestCase.run (/Users/felix (something)/code/node-fast-or-slow/lib/test_case.js:61:8)\n';

    const frames = extractStackFromError(err as Error);

    expect(frames).toEqual([
      {
        filename: '/Users/felix (something)/code/node-fast-or-slow/lib/test_case.js',
        module: 'test_case',
        function: 'TestCase.run',
        lineno: 61,
        colno: 8,
        in_app: true,
      },
      {
        filename: '/Users/felix (something)/code/node-fast-or-slow/lib/test.js',
        module: 'test',
        function: 'Test.run',
        lineno: 45,
        colno: 10,
        in_app: true,
      },
    ]);
  });
});
