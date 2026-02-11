import { describe, expect, it } from 'vitest';
import { exceptionFromError } from '../../src/eventbuilder';
import { defaultStackParser as parser } from '../../src/stack-parsers';

describe('Tracekit - Chrome Tests', () => {
  it('should parse Chrome error with no location', () => {
    const NO_LOCATION = { message: 'foo', name: 'bar', stack: 'error\n at Array.forEach (native)' };
    const ex = exceptionFromError(parser, NO_LOCATION);

    expect(ex).toEqual({
      value: 'foo',
      type: 'bar',
      stacktrace: { frames: [{ filename: 'native', function: 'Array.forEach', in_app: true }] },
    });
  });

  it('should parse Chrome 15 error', () => {
    const CHROME_15 = {
      name: 'foo',
      arguments: ['undef'],
      message: "Object #<Object> has no method 'undef'",
      stack:
        "TypeError: Object #<Object> has no method 'undef'\n" +
        '    at bar (http://path/to/file.js:13:17)\n' +
        '    at bar (http://path/to/file.js:16:5)\n' +
        '    at foo (http://path/to/file.js:20:5)\n' +
        '    at http://path/to/file.js:24:4',
    };

    const ex = exceptionFromError(parser, CHROME_15);

    expect(ex).toEqual({
      value: "Object #<Object> has no method 'undef'",
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: '?', lineno: 24, colno: 4, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 20, colno: 5, in_app: true },
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 16, colno: 5, in_app: true },
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 13, colno: 17, in_app: true },
        ],
      },
    });
  });

  it('should parse Chrome 36 error with port numbers', () => {
    const CHROME_36 = {
      message: 'Default error',
      name: 'Error',
      stack:
        'Error: Default error\n' +
        '    at dumpExceptionError (http://localhost:8080/file.js:41:27)\n' +
        '    at HTMLButtonElement.onclick (http://localhost:8080/file.js:107:146)\n' +
        '    at I.e.fn.(anonymous function) [as index] (http://localhost:8080/file.js:10:3651)',
    };

    const ex = exceptionFromError(parser, CHROME_36);

    expect(ex).toEqual({
      value: 'Default error',
      type: 'Error',
      stacktrace: {
        frames: [
          {
            filename: 'http://localhost:8080/file.js',
            function: 'I.e.fn.(anonymous function) [as index]',
            lineno: 10,
            colno: 3651,
            in_app: true,
          },
          {
            filename: 'http://localhost:8080/file.js',
            function: 'HTMLButtonElement.onclick',
            lineno: 107,
            colno: 146,
            in_app: true,
          },
          {
            filename: 'http://localhost:8080/file.js',
            function: 'dumpExceptionError',
            lineno: 41,
            colno: 27,
            in_app: true,
          },
        ],
      },
    });
  });

  it('should parse Chrome error with webpack URLs', () => {
    // can be generated when Webpack is built with { devtool: eval }
    const CHROME_XX_WEBPACK = {
      message: "Cannot read property 'error' of undefined",
      name: 'TypeError',
      stack:
        "TypeError: Cannot read property 'error' of undefined\n" +
        '   at TESTTESTTEST.eval(webpack:///./src/components/test/test.jsx?:295:108)\n' +
        '   at TESTTESTTEST.render(webpack:///./src/components/test/test.jsx?:272:32)\n' +
        '   at TESTTESTTEST.tryRender(webpack:///./~/react-transform-catch-errors/lib/index.js?:34:31)\n' +
        '   at TESTTESTTEST.proxiedMethod(webpack:///./~/react-proxy/modules/createPrototypeProxy.js?:44:30)',
    };

    const ex = exceptionFromError(parser, CHROME_XX_WEBPACK);

    expect(ex).toEqual({
      value: "Cannot read property 'error' of undefined",
      type: 'TypeError',
      stacktrace: {
        frames: [
          {
            filename: 'webpack:///./~/react-proxy/modules/createPrototypeProxy.js?',
            function: 'TESTTESTTEST.proxiedMethod',
            lineno: 44,
            colno: 30,
            in_app: true,
          },
          {
            filename: 'webpack:///./~/react-transform-catch-errors/lib/index.js?',
            function: 'TESTTESTTEST.tryRender',
            lineno: 34,
            colno: 31,
            in_app: true,
          },
          {
            filename: 'webpack:///./src/components/test/test.jsx?',
            function: 'TESTTESTTEST.render',
            lineno: 272,
            colno: 32,
            in_app: true,
          },
          {
            filename: 'webpack:///./src/components/test/test.jsx?',
            function: 'TESTTESTTEST.eval',
            lineno: 295,
            colno: 108,
            in_app: true,
          },
        ],
      },
    });
  });

  it('should parse nested eval() from Chrome', () => {
    const CHROME_48_EVAL = {
      message: 'message string',
      name: 'Error',
      stack:
        'Error: message string\n' +
        'at baz (eval at foo (eval at speak (http://localhost:8080/file.js:21:17)), <anonymous>:1:30)\n' +
        'at foo (eval at speak (http://localhost:8080/file.js:21:17), <anonymous>:2:96)\n' +
        'at eval (eval at speak (http://localhost:8080/file.js:21:17), <anonymous>:4:18)\n' +
        'at Object.speak (http://localhost:8080/file.js:21:17)\n' +
        'at http://localhost:8080/file.js:31:13\n',
    };

    const ex = exceptionFromError(parser, CHROME_48_EVAL);

    expect(ex).toEqual({
      value: 'message string',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:8080/file.js', function: '?', lineno: 31, colno: 13, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'Object.speak', lineno: 21, colno: 17, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'eval', lineno: 21, colno: 17, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'foo', lineno: 21, colno: 17, in_app: true },
          { filename: 'http://localhost:8080/file.js', function: 'baz', lineno: 21, colno: 17, in_app: true },
        ],
      },
    });
  });

  it('should parse Chrome error with blob URLs', () => {
    const CHROME_48_BLOB = {
      message: 'Error: test',
      name: 'Error',
      stack:
        'Error: test\n' +
        '    at Error (native)\n' +
        '    at s (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:31:29146)\n' +
        '    at Object.d [as add] (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:31:30039)\n' +
        '    at blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a:15:10978\n' +
        '    at blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:1:6911\n' +
        '    at n.fire (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:7:3019)\n' +
        '    at n.handle (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:7:2863)',
    };

    const ex = exceptionFromError(parser, CHROME_48_BLOB);

    expect(ex).toEqual({
      value: 'Error: test',
      type: 'Error',
      stacktrace: {
        frames: [
          {
            filename: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
            function: 'n.handle',
            lineno: 7,
            colno: 2863,
            in_app: true,
          },
          {
            filename: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
            function: 'n.fire',
            lineno: 7,
            colno: 3019,
            in_app: true,
          },
          {
            filename: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
            function: '?',
            lineno: 1,
            colno: 6911,
            in_app: true,
          },
          {
            filename: 'blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a',
            function: '?',
            lineno: 15,
            colno: 10978,
            in_app: true,
          },
          {
            filename: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
            function: 'Object.d [as add]',
            lineno: 31,
            colno: 30039,
            in_app: true,
          },
          {
            filename: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
            function: 's',
            lineno: 31,
            colno: 29146,
            in_app: true,
          },
          { filename: 'native', function: 'Error', in_app: true },
        ],
      },
    });
  });

  it('should parse errors with custom schemes', () => {
    const CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME = {
      message: 'message string',
      name: 'Error',
      stack: `Error: message string
            at examplescheme://examplehost/cd351f7250857e22ceaa.worker.js:70179:15`,
    };

    const ex = exceptionFromError(parser, CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME);

    expect(ex).toEqual({
      value: 'message string',
      type: 'Error',
      stacktrace: {
        frames: [
          {
            filename: 'examplescheme://examplehost/cd351f7250857e22ceaa.worker.js',
            function: '?',
            lineno: 70179,
            colno: 15,
            in_app: true,
          },
        ],
      },
    });
  });

  it('should parse Chrome 73 with native code frames', () => {
    const CHROME73_NATIVE_CODE_EXCEPTION = {
      message: 'test',
      name: 'Error',
      stack: `Error: test
          at fooIterator (http://localhost:5000/test:20:17)
          at Array.map (<anonymous>)
          at foo (http://localhost:5000/test:19:19)
          at http://localhost:5000/test:24:7`,
    };

    const ex = exceptionFromError(parser, CHROME73_NATIVE_CODE_EXCEPTION);

    expect(ex).toEqual({
      value: 'test',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/test', function: '?', lineno: 24, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/test', function: 'foo', lineno: 19, colno: 19, in_app: true },
          { filename: '<anonymous>', function: 'Array.map', in_app: true },
          { filename: 'http://localhost:5000/test', function: 'fooIterator', lineno: 20, colno: 17, in_app: true },
        ],
      },
    });
  });

  it('should parse exceptions with eval frames in Chrome 73', () => {
    const CHROME73_EVAL_EXCEPTION = {
      message: 'bad',
      name: 'Error',
      stack: `Error: bad
          at Object.aha (http://localhost:5000/:19:13)
          at callAnotherThing (http://localhost:5000/:20:16)
          at Object.callback (http://localhost:5000/:25:7)
          at http://localhost:5000/:34:17
          at Array.map (<anonymous>)
          at test (http://localhost:5000/:33:23)
          at eval (eval at aha (http://localhost:5000/:37:5), <anonymous>:1:1)
          at aha (http://localhost:5000/:39:5)
          at Foo.testMethod (http://localhost:5000/:44:7)
          at http://localhost:5000/:50:19`,
    };

    const ex = exceptionFromError(parser, CHROME73_EVAL_EXCEPTION);

    expect(ex).toEqual({
      value: 'bad',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: '?', lineno: 50, colno: 19, in_app: true },
          { filename: 'http://localhost:5000/', function: 'Foo.testMethod', lineno: 44, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 39, colno: 5, in_app: true },
          { filename: 'http://localhost:5000/', function: 'eval', lineno: 37, colno: 5, in_app: true },
          { filename: 'http://localhost:5000/', function: 'test', lineno: 33, colno: 23, in_app: true },
          { filename: '<anonymous>', function: 'Array.map', in_app: true },
          { filename: 'http://localhost:5000/', function: '?', lineno: 34, colno: 17, in_app: true },
          { filename: 'http://localhost:5000/', function: 'Object.callback', lineno: 25, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callAnotherThing', lineno: 20, colno: 16, in_app: true },
          { filename: 'http://localhost:5000/', function: 'Object.aha', lineno: 19, colno: 13, in_app: true },
        ],
      },
    });
  });

  it('should parse frames with async urls', () => {
    const CHROME_109_ASYNC_URL = {
      message: 'bad',
      name: 'Error',
      stack: `Error: bad
          at callAnotherThing (http://localhost:5000/:20:16)
          at Object.callback (async http://localhost:5000/:25:7)
          at test (http://localhost:5000/:33:23)`,
    };

    const ex = exceptionFromError(parser, CHROME_109_ASYNC_URL);

    expect(ex).toEqual({
      value: 'bad',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: 'test', lineno: 33, colno: 23, in_app: true },
          { filename: 'http://localhost:5000/', function: 'Object.callback', lineno: 25, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callAnotherThing', lineno: 20, colno: 16, in_app: true },
        ],
      },
    });
  });

  it('should parse exceptions with native code frames in Edge 44', () => {
    const EDGE44_NATIVE_CODE_EXCEPTION = {
      message: 'test',
      name: 'Error',
      stack: `Error: test
            at fooIterator (http://localhost:5000/test:20:11)
            at Array.prototype.map (native code)
            at foo (http://localhost:5000/test:19:9)
            at Global code (http://localhost:5000/test:24:7)`,
    };

    const ex = exceptionFromError(parser, EDGE44_NATIVE_CODE_EXCEPTION);

    expect(ex).toEqual({
      value: 'test',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/test', function: 'Global code', lineno: 24, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/test', function: 'foo', lineno: 19, colno: 9, in_app: true },
          { filename: 'native code', function: 'Array.prototype.map', in_app: true },
          { filename: 'http://localhost:5000/test', function: 'fooIterator', lineno: 20, colno: 11, in_app: true },
        ],
      },
    });
  });

  it('should parse exceptions with eval frames in Edge 44', () => {
    const EDGE44_EVAL_EXCEPTION = {
      message: 'aha',
      name: 'Error',
      stack: `Error: bad
            at aha (http://localhost:5000/:19:7)
            at callAnotherThing (http://localhost:5000/:18:6)
            at callback (http://localhost:5000/:25:7)
            at Anonymous function (http://localhost:5000/:34:7)
            at Array.prototype.map (native code)
            at test (http://localhost:5000/:33:5)
            at eval code (eval code:1:1)
            at aha (http://localhost:5000/:39:5)
            at Foo.prototype.testMethod (http://localhost:5000/:44:7)
            at Anonymous function (http://localhost:5000/:50:8)`,
    };

    const ex = exceptionFromError(parser, EDGE44_EVAL_EXCEPTION);

    expect(ex).toEqual({
      value: 'aha',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: 'Anonymous function', lineno: 50, colno: 8, in_app: true },
          {
            filename: 'http://localhost:5000/',
            function: 'Foo.prototype.testMethod',
            lineno: 44,
            colno: 7,
            in_app: true,
          },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 39, colno: 5, in_app: true },
          { filename: 'eval code', function: 'eval code', lineno: 1, colno: 1, in_app: true },
          { filename: 'http://localhost:5000/', function: 'test', lineno: 33, colno: 5, in_app: true },
          { filename: 'native code', function: 'Array.prototype.map', in_app: true },
          { filename: 'http://localhost:5000/', function: 'Anonymous function', lineno: 34, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callback', lineno: 25, colno: 7, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callAnotherThing', lineno: 18, colno: 6, in_app: true },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 19, colno: 7, in_app: true },
        ],
      },
    });
  });

  it('should parse exceptions called within an iframe in Electron Renderer', () => {
    const CHROME_ELECTRON_RENDERER = {
      message: "Cannot read property 'error' of undefined",
      name: 'TypeError',
      stack: `TypeError: Cannot read property 'error' of undefined
            at TESTTESTTEST.someMethod (C:\\Users\\user\\path\\to\\file.js:295:108)`,
    };

    const ex = exceptionFromError(parser, CHROME_ELECTRON_RENDERER);

    expect(ex).toEqual({
      value: "Cannot read property 'error' of undefined",
      type: 'TypeError',
      stacktrace: {
        frames: [
          {
            filename: 'C:\\Users\\user\\path\\to\\file.js',
            function: 'TESTTESTTEST.someMethod',
            lineno: 295,
            colno: 108,
            in_app: true,
          },
        ],
      },
    });
  });

  it('should parse exceptions with frames without full paths', () => {
    const EXCEPTION = {
      message: 'aha',
      name: 'Error',
      stack: `Error
      at Client.requestPromise (api.tsx:554:1)
      at doDiscoverQuery (genericDiscoverQuery.tsx?33f8:328:1)
      at _GenericDiscoverQuery.eval [as fetchData] (genericDiscoverQuery.tsx?33f8:256:1)
      at _GenericDiscoverQuery.componentDidMount (genericDiscoverQuery.tsx?33f8:152:1)
      at commitLifeCycles (react-dom.development.js?f8c1:20663:1)
      at commitLayoutEffects (react-dom.development.js?f8c1:23426:1)`,
    };

    const ex = exceptionFromError(parser, EXCEPTION);

    expect(ex).toEqual({
      value: 'aha',
      type: 'Error',
      stacktrace: {
        frames: [
          {
            filename: 'react-dom.development.js?f8c1',
            function: 'commitLayoutEffects',
            in_app: true,
            lineno: 23426,
            colno: 1,
          },
          {
            filename: 'react-dom.development.js?f8c1',
            function: 'commitLifeCycles',
            in_app: true,
            lineno: 20663,
            colno: 1,
          },
          {
            filename: 'genericDiscoverQuery.tsx?33f8',
            function: '_GenericDiscoverQuery.componentDidMount',
            in_app: true,
            lineno: 152,
            colno: 1,
          },
          {
            filename: 'genericDiscoverQuery.tsx?33f8',
            function: '_GenericDiscoverQuery.eval [as fetchData]',
            in_app: true,
            lineno: 256,
            colno: 1,
          },
          {
            filename: 'genericDiscoverQuery.tsx?33f8',
            function: 'doDiscoverQuery',
            in_app: true,
            lineno: 328,
            colno: 1,
          },
          {
            filename: 'api.tsx',
            function: 'Client.requestPromise',
            in_app: true,
            lineno: 554,
            colno: 1,
          },
        ],
      },
    });
  });

  it('should parse webpack wrapped exceptions', () => {
    const EXCEPTION = {
      message: 'aha',
      name: 'ChunkLoadError',
      stack: `ChunkLoadError: Loading chunk app_bootstrap_initializeLocale_tsx failed.
      (error: https://s1.sentry-cdn.com/_static/dist/sentry/chunks/app_bootstrap_initializeLocale_tsx.abcdefg.js)
        at (error: (/_static/dist/sentry/chunks/app_bootstrap_initializeLocale_tsx.abcdefg.js))
        at key(webpack/runtime/jsonp chunk loading:27:18)
        at ? (webpack/runtime/ensure chunk:6:25)
        at Array.reduce(<anonymous>)`,
    };

    const ex = exceptionFromError(parser, EXCEPTION);

    expect(ex).toEqual({
      value: 'aha',
      type: 'ChunkLoadError',
      stacktrace: {
        frames: [
          { filename: '<anonymous>', function: 'Array.reduce', in_app: true },
          {
            filename: 'webpack/runtime/ensure chunk',
            function: '?',
            in_app: true,
            lineno: 6,
            colno: 25,
          },
          {
            filename: 'webpack/runtime/jsonp chunk loading',
            function: 'key',
            in_app: true,
            lineno: 27,
            colno: 18,
          },
          {
            filename: '/_static/dist/sentry/chunks/app_bootstrap_initializeLocale_tsx.abcdefg.js',
            function: '?',
            in_app: true,
          },
          {
            filename:
              'https://s1.sentry-cdn.com/_static/dist/sentry/chunks/app_bootstrap_initializeLocale_tsx.abcdefg.js',
            function: '?',
            in_app: true,
          },
        ],
      },
    });
  });

  it('handles braces in urls', () => {
    const CHROME_BRACES_URL = {
      message: 'bad',
      name: 'Error',
      stack: `Error: bad
          at something (http://localhost:5000/(some)/(thing)/index.html:20:16)
          at http://localhost:5000/(group)/[route]/script.js:1:126
          at more (http://localhost:5000/(some)/(thing)/index.html:25:7)`,
    };

    const ex = exceptionFromError(parser, CHROME_BRACES_URL);

    expect(ex).toEqual({
      value: 'bad',
      type: 'Error',
      stacktrace: {
        frames: [
          {
            filename: 'http://localhost:5000/(some)/(thing)/index.html',
            function: 'more',
            lineno: 25,
            colno: 7,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/(group)/[route]/script.js',
            function: '?',
            lineno: 1,
            colno: 126,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/(some)/(thing)/index.html',
            function: 'something',
            lineno: 20,
            colno: 16,
            in_app: true,
          },
        ],
      },
    });
  });

  it('should truncate frames that are over 1kb', () => {
    const LONG_STR = 'A'.repeat(1040);

    const LONG_FRAME = {
      message: 'bad',
      name: 'Error',
      stack: `Error: bad
          at aha (http://localhost:5000/:39:5)
          at Foo.testMethod (http://localhost:5000/${LONG_STR}:44:7)
          at http://localhost:5000/:50:19`,
    };

    const ex = exceptionFromError(parser, LONG_FRAME);

    expect(ex).toEqual({
      value: 'bad',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: '?', lineno: 50, colno: 19, in_app: true },
          {
            filename:
              'http://localhost:5000/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            function: 'Foo.testMethod',
            in_app: true,
          },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 39, colno: 5, in_app: true },
        ],
      },
    });
  });

  it('should correctly parse a wasm stack trace', () => {
    const WASM_ERROR = {
      message: 'memory access out of bounds',
      name: 'RuntimeError',
      stack: `RuntimeError: memory access out of bounds
      at MyClass::bar(int) const (http://localhost:8001/main.wasm:wasm-function[190]:0x5aeb)
      at MyClass::foo(int) const (http://localhost:8001/main.wasm:wasm-function[186]:0x5637)
      at MyClass::getAt(int) const (http://localhost:8001/main.wasm:wasm-function[182]:0x540b)
      at emscripten::internal::MethodInvoker<int (MyClass::*)(int) const, int, MyClass const*, int>::invoke(int (MyClass::* const&)(int) const, MyClass const*, int) (http://localhost:8001/main.wasm:wasm-function[152]:0x47df)
      at ClassHandle.MyClass$getAt [as getAt] (eval at newFunc (http://localhost:8001/main.js:2201:27), <anonymous>:9:10)
      at myFunctionVectorOutOfBounds (http://localhost:8001/main.html:18:22)
      at captureError (http://localhost:8001/main.html:27:11)
      at Object.onRuntimeInitialized (http://localhost:8001/main.html:39:9)
      at doRun (http://localhost:8001/main.js:7084:71)
      at run (http://localhost:8001/main.js:7101:5)`,
    };

    const ex = exceptionFromError(parser, WASM_ERROR);

    // This is really ugly but the wasm integration should clean up these stack frames
    expect(ex).toStrictEqual({
      stacktrace: {
        frames: [
          {
            colno: 5,
            filename: 'http://localhost:8001/main.js',
            function: 'run',
            in_app: true,
            lineno: 7101,
          },
          {
            colno: 71,
            filename: 'http://localhost:8001/main.js',
            function: 'doRun',
            in_app: true,
            lineno: 7084,
          },
          {
            colno: 9,
            filename: 'http://localhost:8001/main.html',
            function: 'Object.onRuntimeInitialized',
            in_app: true,
            lineno: 39,
          },
          {
            colno: 11,
            filename: 'http://localhost:8001/main.html',
            function: 'captureError',
            in_app: true,
            lineno: 27,
          },
          {
            colno: 22,
            filename: 'http://localhost:8001/main.html',
            function: 'myFunctionVectorOutOfBounds',
            in_app: true,
            lineno: 18,
          },
          {
            colno: 27,
            filename: 'http://localhost:8001/main.js',
            function: 'ClassHandle.MyClass$getAt [as getAt]',
            in_app: true,
            lineno: 2201,
          },
          {
            filename:
              'int) const, int, MyClass const*, int>::invoke(int (MyClass::* const&)(int) const, MyClass const*, int) (http://localhost:8001/main.wasm:wasm-function[152]:0x47df',
            function: 'emscripten::internal::MethodInvoker<int (MyClass::*)',
            in_app: true,
          },
          {
            filename: 'int) const (http://localhost:8001/main.wasm:wasm-function[182]:0x540b',
            function: 'MyClass::getAt',
            in_app: true,
          },
          {
            filename: 'int) const (http://localhost:8001/main.wasm:wasm-function[186]:0x5637',
            function: 'MyClass::foo',
            in_app: true,
          },
          {
            filename: 'int) const (http://localhost:8001/main.wasm:wasm-function[190]:0x5aeb',
            function: 'MyClass::bar',
            in_app: true,
          },
        ],
      },
      type: 'RuntimeError',
      value: 'memory access out of bounds',
    });
  });

  it('should correctly parse with data uris', () => {
    const DATA_URI_ERROR = {
      message: 'Error from data-uri module',
      name: 'Error',
      stack: `Error: Error from data-uri module
                at dynamicFn (data:application/javascript,export function dynamicFn() {  throw new Error('Error from data-uri module');};:1:38)
                at loadDodgyModule (file:///Users/tim/Documents/Repositories/data-uri-tests/index.mjs:8:5)
                at async callSomeFunction (file:///Users/tim/Documents/Repositories/data-uri-tests/index.mjs:12:5)
                at async file:///Users/tim/Documents/Repositories/data-uri-tests/index.mjs:16:5`,
    };

    const ex = exceptionFromError(parser, DATA_URI_ERROR);

    // This is really ugly but the wasm integration should clean up these stack frames
    expect(ex).toStrictEqual({
      stacktrace: {
        frames: [
          {
            colno: 5,
            filename: 'file:///Users/tim/Documents/Repositories/data-uri-tests/index.mjs',
            function: '?',
            in_app: true,
            lineno: 16,
          },
          {
            colno: 5,
            filename: 'file:///Users/tim/Documents/Repositories/data-uri-tests/index.mjs',
            function: 'async callSomeFunction',
            in_app: true,
            lineno: 12,
          },
          {
            colno: 5,
            filename: 'file:///Users/tim/Documents/Repositories/data-uri-tests/index.mjs',
            function: 'loadDodgyModule',
            in_app: true,
            lineno: 8,
          },
          {
            filename: '<data:application/javascript>',
            function: 'dynamicFn',
          },
        ],
      },
      type: 'Error',
      value: 'Error from data-uri module',
    });
  });
});
