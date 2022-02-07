import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - Chrome Tests', () => {
  it('should parse Chrome error with no location', () => {
    const NO_LOCATION = { message: 'foo', name: 'bar', stack: 'error\n at Array.forEach (native)' };
    const stackFrames = computeStackTrace(NO_LOCATION);

    expect(stackFrames).toEqual({
      message: 'foo',
      name: 'bar',
      stack: [{ url: 'native', func: 'Array.forEach', line: null, column: null }],
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

    const stackFrames = computeStackTrace(CHROME_15);

    expect(stackFrames).toEqual({
      message: "Object #<Object> has no method 'undef'",
      name: 'foo',
      stack: [
        { url: 'http://path/to/file.js', func: 'bar', line: 13, column: 17 },
        { url: 'http://path/to/file.js', func: 'bar', line: 16, column: 5 },
        { url: 'http://path/to/file.js', func: 'foo', line: 20, column: 5 },
        { url: 'http://path/to/file.js', func: '?', line: 24, column: 4 },
      ],
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

    const stackFrames = computeStackTrace(CHROME_36);

    expect(stackFrames).toEqual({
      message: 'Default error',
      name: 'Error',
      stack: [
        { url: 'http://localhost:8080/file.js', func: 'dumpExceptionError', line: 41, column: 27 },
        { url: 'http://localhost:8080/file.js', func: 'HTMLButtonElement.onclick', line: 107, column: 146 },
        {
          url: 'http://localhost:8080/file.js',
          func: 'I.e.fn.(anonymous function) [as index]',
          line: 10,
          column: 3651,
        },
      ],
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

    const stackFrames = computeStackTrace(CHROME_XX_WEBPACK);

    expect(stackFrames).toEqual({
      message: "Cannot read property 'error' of undefined",
      name: 'TypeError',
      stack: [
        { url: 'webpack:///./src/components/test/test.jsx?', func: 'TESTTESTTEST.eval', line: 295, column: 108 },
        { url: 'webpack:///./src/components/test/test.jsx?', func: 'TESTTESTTEST.render', line: 272, column: 32 },
        {
          url: 'webpack:///./~/react-transform-catch-errors/lib/index.js?',
          func: 'TESTTESTTEST.tryRender',
          line: 34,
          column: 31,
        },
        {
          url: 'webpack:///./~/react-proxy/modules/createPrototypeProxy.js?',
          func: 'TESTTESTTEST.proxiedMethod',
          line: 44,
          column: 30,
        },
      ],
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

    const stackFrames = computeStackTrace(CHROME_48_EVAL);

    expect(stackFrames).toEqual({
      message: 'message string',
      name: 'Error',
      stack: [
        { url: 'http://localhost:8080/file.js', func: 'baz', line: 21, column: 17 },
        { url: 'http://localhost:8080/file.js', func: 'foo', line: 21, column: 17 },
        { url: 'http://localhost:8080/file.js', func: 'eval', line: 21, column: 17 },
        { url: 'http://localhost:8080/file.js', func: 'Object.speak', line: 21, column: 17 },
        { url: 'http://localhost:8080/file.js', func: '?', line: 31, column: 13 },
      ],
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

    const stackFrames = computeStackTrace(CHROME_48_BLOB);

    expect(stackFrames).toEqual({
      message: 'Error: test',
      name: 'Error',
      stack: [
        { url: 'native', func: 'Error', line: null, column: null },
        {
          url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
          func: 's',
          line: 31,
          column: 29146,
        },
        {
          url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
          func: 'Object.d [as add]',
          line: 31,
          column: 30039,
        },
        {
          url: 'blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a',
          func: '?',
          line: 15,
          column: 10978,
        },
        {
          url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
          func: '?',
          line: 1,
          column: 6911,
        },
        {
          url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
          func: 'n.fire',
          line: 7,
          column: 3019,
        },
        {
          url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
          func: 'n.handle',
          line: 7,
          column: 2863,
        },
      ],
    });
  });

  it('should parse errors with custom schemes', () => {
    const CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME = {
      message: 'message string',
      name: 'Error',
      stack: `Error: message string
            at examplescheme://examplehost/cd351f7250857e22ceaa.worker.js:70179:15`,
    };

    const stacktrace = computeStackTrace(CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME);

    expect(stacktrace).toEqual({
      message: 'message string',
      name: 'Error',
      stack: [
        { url: 'examplescheme://examplehost/cd351f7250857e22ceaa.worker.js', func: '?', line: 70179, column: 15 },
      ],
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

    const stacktrace = computeStackTrace(CHROME73_NATIVE_CODE_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'test',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/test', func: 'fooIterator', line: 20, column: 17 },
        { url: '<anonymous>', func: 'Array.map', line: null, column: null },
        { url: 'http://localhost:5000/test', func: 'foo', line: 19, column: 19 },
        { url: 'http://localhost:5000/test', func: '?', line: 24, column: 7 },
      ],
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

    const stacktrace = computeStackTrace(CHROME73_EVAL_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'bad',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/', func: 'Object.aha', line: 19, column: 13 },
        { url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, column: 16 },
        { url: 'http://localhost:5000/', func: 'Object.callback', line: 25, column: 7 },
        { url: 'http://localhost:5000/', func: '?', line: 34, column: 17 },
        { url: '<anonymous>', func: 'Array.map', line: null, column: null },
        { url: 'http://localhost:5000/', func: 'test', line: 33, column: 23 },
        { url: 'http://localhost:5000/', func: 'eval', line: 37, column: 5 },
        { url: 'http://localhost:5000/', func: 'aha', line: 39, column: 5 },
        { url: 'http://localhost:5000/', func: 'Foo.testMethod', line: 44, column: 7 },
        { url: 'http://localhost:5000/', func: '?', line: 50, column: 19 },
      ],
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

    const stacktrace = computeStackTrace(EDGE44_NATIVE_CODE_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'test',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/test', func: 'fooIterator', line: 20, column: 11 },
        { url: 'native code', func: 'Array.prototype.map', line: null, column: null },
        { url: 'http://localhost:5000/test', func: 'foo', line: 19, column: 9 },
        { url: 'http://localhost:5000/test', func: 'Global code', line: 24, column: 7 },
      ],
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

    const stacktrace = computeStackTrace(EDGE44_EVAL_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'aha',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/', func: 'aha', line: 19, column: 7 },
        { url: 'http://localhost:5000/', func: 'callAnotherThing', line: 18, column: 6 },
        { url: 'http://localhost:5000/', func: 'callback', line: 25, column: 7 },
        { url: 'http://localhost:5000/', func: 'Anonymous function', line: 34, column: 7 },
        { url: 'native code', func: 'Array.prototype.map', line: null, column: null },
        { url: 'http://localhost:5000/', func: 'test', line: 33, column: 5 },
        { url: 'eval code', func: 'eval code', line: 1, column: 1 },
        { url: 'http://localhost:5000/', func: 'aha', line: 39, column: 5 },
        { url: 'http://localhost:5000/', func: 'Foo.prototype.testMethod', line: 44, column: 7 },
        { url: 'http://localhost:5000/', func: 'Anonymous function', line: 50, column: 8 },
      ],
    });
  });

  it('should parse exceptions called within an iframe in Electron Renderer', () => {
    const CHROME_ELECTRON_RENDERER = {
      message: "Cannot read property 'error' of undefined",
      name: 'TypeError',
      stack: `TypeError: Cannot read property 'error' of undefined
            at TESTTESTTEST.someMethod (C:\\Users\\user\\path\\to\\file.js:295:108)`,
    };

    const stacktrace = computeStackTrace(CHROME_ELECTRON_RENDERER);

    expect(stacktrace).toEqual({
      message: "Cannot read property 'error' of undefined",
      name: 'TypeError',
      stack: [{ url: 'C:\\Users\\user\\path\\to\\file.js', func: 'TESTTESTTEST.someMethod', line: 295, column: 108 }],
    });
  });
});
