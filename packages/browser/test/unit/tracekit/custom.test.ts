import { expect } from 'chai';

import { _computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - Custom Tests', () => {
  it('should parse errors with custom schemes', () => {
    const CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME = {
      message: 'message string',
      name: 'Error',
      stack: `Error: message string
            at examplescheme://examplehost/cd351f7250857e22ceaa.worker.js:70179:15`,
    };

    const stacktrace = _computeStackTrace(CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME);

    expect(stacktrace.stack).deep.equal([
      {
        args: [],
        column: 15,
        context: null,
        func: '?',
        line: 70179,
        url: 'examplescheme://examplehost/cd351f7250857e22ceaa.worker.js',
      },
    ]);
  });

  describe('should parse exceptions with native code frames', () => {
    it('in Chrome 73', () => {
      const CHROME73_NATIVE_CODE_EXCEPTION = {
        message: 'test',
        name: 'Error',
        stack: `Error: test
            at fooIterator (http://localhost:5000/test:20:17)
            at Array.map (<anonymous>)
            at foo (http://localhost:5000/test:19:19)
            at http://localhost:5000/test:24:7`,
      };

      const stacktrace = _computeStackTrace(CHROME73_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { args: [], column: 17, context: null, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        { args: [], column: null, context: null, func: 'Array.map', line: null, url: '<anonymous>' },
        { args: [], column: 19, context: null, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 7, context: null, func: '?', line: 24, url: 'http://localhost:5000/test' },
      ]);
    });

    it('in Firefox 66', () => {
      const FIREFOX66_NATIVE_CODE_EXCEPTION = {
        message: 'test',
        name: 'Error',
        stack: `fooIterator@http://localhost:5000/test:20:17
            foo@http://localhost:5000/test:19:19
            @http://localhost:5000/test:24:7`,
      };

      const stacktrace = _computeStackTrace(FIREFOX66_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { args: [], column: 17, context: null, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        { args: [], column: 19, context: null, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 7, context: null, func: '?', line: 24, url: 'http://localhost:5000/test' },
      ]);
    });

    it('in Safari 12', () => {
      const SAFARI12_NATIVE_CODE_EXCEPTION = {
        message: 'test',
        name: 'Error',
        stack: `fooIterator@http://localhost:5000/test:20:26
            map@[native code]
            foo@http://localhost:5000/test:19:22
            global code@http://localhost:5000/test:24:10`,
      };

      const stacktrace = _computeStackTrace(SAFARI12_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { args: [], column: 26, context: null, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        { args: [], column: null, context: null, func: 'map', line: null, url: '[native code]' },
        { args: [], column: 22, context: null, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 10, context: null, func: 'global code', line: 24, url: 'http://localhost:5000/test' },
      ]);
    });

    it('in Edge 44', () => {
      const EDGE44_NATIVE_CODE_EXCEPTION = {
        message: 'test',
        name: 'Error',
        stack: `Error: test
            at fooIterator (http://localhost:5000/test:20:11)
            at Array.prototype.map (native code)
            at foo (http://localhost:5000/test:19:9)
            at Global code (http://localhost:5000/test:24:7)`,
      };

      const stacktrace = _computeStackTrace(EDGE44_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { args: [], column: 11, context: null, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        {
          args: ['native code'],
          column: null,
          context: null,
          func: 'Array.prototype.map',
          line: null,
          url: 'native code',
        },
        { args: [], column: 9, context: null, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 7, context: null, func: 'Global code', line: 24, url: 'http://localhost:5000/test' },
      ]);
    });
  });

  describe('should parse exceptions with eval frames', () => {
    it('in Chrome 73', () => {
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

      const stacktrace = _computeStackTrace(CHROME73_EVAL_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { column: 13, url: 'http://localhost:5000/', func: 'Object.aha', line: 19, context: null, args: [] },
        { column: 16, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, context: null, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'Object.callback', line: 25, context: null, args: [] },
        { column: 17, url: 'http://localhost:5000/', func: '?', line: 34, context: null, args: [] },
        { column: null, url: '<anonymous>', func: 'Array.map', line: null, context: null, args: [] },
        { column: 23, url: 'http://localhost:5000/', func: 'test', line: 33, context: null, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'eval', line: 37, context: null, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'aha', line: 39, context: null, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'Foo.testMethod', line: 44, context: null, args: [] },
        { column: 19, url: 'http://localhost:5000/', func: '?', line: 50, context: null, args: [] },
      ]);
    });

    it('in Firefox 66', () => {
      const FIREFOX66_EVAL_EXCEPTION = {
        message: 'aha',
        name: 'Error',
        stack: `aha@http://localhost:5000/:19:13
            callAnotherThing@http://localhost:5000/:20:15
            callback@http://localhost:5000/:25:7
            test/<@http://localhost:5000/:34:7
            test@http://localhost:5000/:33:23
            @http://localhost:5000/ line 39 > eval:1:1
            aha@http://localhost:5000/:39:5
            testMethod@http://localhost:5000/:44:7
            @http://localhost:5000/:50:19`,
      };

      const stacktrace = _computeStackTrace(FIREFOX66_EVAL_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { column: 13, url: 'http://localhost:5000/', func: 'aha', line: 19, context: null, args: [] },
        { column: 15, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, context: null, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'callback', line: 25, context: null, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'test/<', line: 34, context: null, args: [] },
        { column: 23, url: 'http://localhost:5000/', func: 'test', line: 33, context: null, args: [] },
        { column: null, url: 'http://localhost:5000/', func: 'eval', line: 39, context: null, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'aha', line: 39, context: null, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'testMethod', line: 44, context: null, args: [] },
        { column: 19, url: 'http://localhost:5000/', func: '?', line: 50, context: null, args: [] },
      ]);
    });

    it('in Safari 12', () => {
      const SAFARI12_EVAL_EXCEPTION = {
        message: 'aha',
        name: 'Error',
        stack: `aha@http://localhost:5000/:19:22
            aha@[native code]
            callAnotherThing@http://localhost:5000/:20:16
            callback@http://localhost:5000/:25:23
            http://localhost:5000/:34:25
            map@[native code]
            test@http://localhost:5000/:33:26
            eval code
            eval@[native code]
            aha@http://localhost:5000/:39:9
            testMethod@http://localhost:5000/:44:10
            http://localhost:5000/:50:29`,
      };

      const stacktrace = _computeStackTrace(SAFARI12_EVAL_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { column: 22, url: 'http://localhost:5000/', func: 'aha', line: 19, context: null, args: [] },
        { column: null, url: '[native code]', func: 'aha', line: null, context: null, args: [] },
        { column: 16, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, context: null, args: [] },
        { column: 23, url: 'http://localhost:5000/', func: 'callback', line: 25, context: null, args: [] },
        { column: 25, url: 'http://localhost:5000/', func: '?', line: 34, context: null, args: [] },
        { column: null, url: '[native code]', func: 'map', line: null, context: null, args: [] },
        { column: 26, url: 'http://localhost:5000/', func: 'test', line: 33, context: null, args: [] },
        { column: null, url: '[native code]', func: 'eval', line: null, context: null, args: [] },
        { column: 9, url: 'http://localhost:5000/', func: 'aha', line: 39, context: null, args: [] },
        { column: 10, url: 'http://localhost:5000/', func: 'testMethod', line: 44, context: null, args: [] },
        { column: 29, url: 'http://localhost:5000/', func: '?', line: 50, context: null, args: [] },
      ]);
    });

    it('in Edge 44', () => {
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

      const stacktrace = _computeStackTrace(EDGE44_EVAL_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        { column: 7, url: 'http://localhost:5000/', func: 'aha', line: 19, context: null, args: [] },
        { column: 6, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 18, context: null, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'callback', line: 25, context: null, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'Anonymous function', line: 34, context: null, args: [] },
        {
          args: ['native code'],
          column: null,
          context: null,
          func: 'Array.prototype.map',
          line: null,
          url: 'native code',
        },
        { column: 5, url: 'http://localhost:5000/', func: 'test', line: 33, context: null, args: [] },
        { column: 1, url: 'eval code', func: 'eval code', line: 1, context: null, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'aha', line: 39, context: null, args: [] },
        {
          args: [],
          column: 7,
          context: null,
          func: 'Foo.prototype.testMethod',
          line: 44,
          url: 'http://localhost:5000/',
        },
        { column: 8, url: 'http://localhost:5000/', func: 'Anonymous function', line: 50, context: null, args: [] },
      ]);
    });
  });

  describe('should parse exceptions called within an iframe', () => {
    it('in Electron Renderer', () => {
      const CHROME_ELECTRON_RENDERER = {
        message: "Cannot read property 'error' of undefined",
        name: 'TypeError',
        stack: `TypeError: Cannot read property 'error' of undefined
            at TESTTESTTEST.someMethod (C:\\Users\\user\\path\\to\\file.js:295:108)`,
      };

      const stacktrace = _computeStackTrace(CHROME_ELECTRON_RENDERER);

      expect(stacktrace.stack).deep.equal([
        {
          args: [],
          column: 108,
          context: null,
          func: 'TESTTESTTEST.someMethod',
          line: 295,
          url: 'C:\\Users\\user\\path\\to\\file.js',
        },
      ]);
    });
  });

  describe('React', () => {
    it('should correctly parse Invariant Violation errors and use framesToPop to drop info message', () => {
      const REACT_INVARIANT_VIOLATION_EXCEPTION = {
        framesToPop: 1,
        message:
          'Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings. ',
        name: 'Invariant Violation',
        stack: `Invariant Violation: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
            at http://localhost:5000/static/js/foo.chunk.js:1:21738
            at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
            at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
            at f (http://localhost:5000/:1:980)`,
      };

      const stacktrace = _computeStackTrace(REACT_INVARIANT_VIOLATION_EXCEPTION);

      expect(stacktrace.stack).deep.equal([
        {
          args: [],
          column: 21738,
          context: null,
          func: '?',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 21841,
          context: null,
          func: 'a',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 68735,
          context: null,
          func: 'ho',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 980,
          context: null,
          func: 'f',
          line: 1,
          url: 'http://localhost:5000/',
        },
      ]);
    });
  });
});
