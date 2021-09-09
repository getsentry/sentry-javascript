import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - Custom Tests', () => {
  it('should parse errors with custom schemes', () => {
    const CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME = {
      message: 'message string',
      name: 'Error',
      stack: `Error: message string
            at examplescheme://examplehost/cd351f7250857e22ceaa.worker.js:70179:15`,
    };

    const stacktrace = computeStackTrace(CHROMIUM_EMBEDDED_FRAMEWORK_CUSTOM_SCHEME);

    expect(stacktrace.stack).toEqual([
      {
        args: [],
        column: 15,
        func: '?',
        line: 70179,
        url: 'examplescheme://examplehost/cd351f7250857e22ceaa.worker.js',
      },
    ]);
  });

  describe('Safari extensions', () => {
    it('should parse exceptions for safari-extension', () => {
      const SAFARI_EXTENSION_EXCEPTION = {
        message: 'wat',
        name: 'Error',
        stack: `Error: wat
      at ClipperError@safari-extension:(//3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js:223036:10)
      at safari-extension:(//3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js:3313:26)`,
      };
      const stacktrace = computeStackTrace(SAFARI_EXTENSION_EXCEPTION);
      expect(stacktrace.stack).toEqual([
        {
          url: 'safari-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js',
          func: 'ClipperError',
          args: [],
          line: 223036,
          column: 10,
        },
        {
          url: 'safari-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js',
          func: '?',
          args: [],
          line: 3313,
          column: 26,
        },
      ]);
    });

    it('should parse exceptions for safari-extension with frames-only stack', () => {
      const SAFARI_EXTENSION_EXCEPTION = {
        message: `undefined is not an object (evaluating 'e.groups.includes')`,
        name: `TypeError`,
        stack: `isClaimed@safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js:2:929865
        safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js:2:1588410
        promiseReactionJob@[native code]`,
      };
      const stacktrace = computeStackTrace(SAFARI_EXTENSION_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        {
          url: 'safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js',
          func: 'isClaimed',
          args: [],
          line: 2,
          column: 929865,
        },
        {
          url: 'safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js',
          func: '?',
          args: [],
          line: 2,
          column: 1588410,
        },
        {
          url: '[native code]',
          func: 'promiseReactionJob',
          args: [],
          line: null,
          column: null,
        },
      ]);
    });

    it('should parse exceptions for safari-web-extension', () => {
      const SAFARI_WEB_EXTENSION_EXCEPTION = {
        message: 'wat',
        name: 'Error',
        stack: `Error: wat
      at ClipperError@safari-web-extension:(//3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js:223036:10)
      at safari-web-extension:(//3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js:3313:26)`,
      };
      const stacktrace = computeStackTrace(SAFARI_WEB_EXTENSION_EXCEPTION);
      expect(stacktrace.stack).toEqual([
        {
          url: 'safari-web-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js',
          func: 'ClipperError',
          args: [],
          line: 223036,
          column: 10,
        },
        {
          url: 'safari-web-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js',
          func: '?',
          args: [],
          line: 3313,
          column: 26,
        },
      ]);
    });

    it('should parse exceptions for safari-web-extension with frames-only stack', () => {
      const SAFARI_EXTENSION_EXCEPTION = {
        message: `undefined is not an object (evaluating 'e.groups.includes')`,
        name: `TypeError`,
        stack: `p_@safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js:29:33314
      safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js:29:56027
      promiseReactionJob@[native code]`,
      };
      const stacktrace = computeStackTrace(SAFARI_EXTENSION_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        {
          url: 'safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js',
          func: 'p_',
          args: [],
          line: 29,
          column: 33314,
        },
        {
          url: 'safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js',
          func: '?',
          args: [],
          line: 29,
          column: 56027,
        },
        {
          url: '[native code]',
          func: 'promiseReactionJob',
          args: [],
          line: null,
          column: null,
        },
      ]);
    });
  });

  it('should parse exceptions for react-native-v8', () => {
    const REACT_NATIVE_V8_EXCEPTION = {
      message: 'Manually triggered crash to test Sentry reporting',
      name: 'Error',
      stack: `Error: Manually triggered crash to test Sentry reporting
          at Object.onPress(index.android.bundle:2342:3773)
          at s.touchableHandlePress(index.android.bundle:214:2048)
          at s._performSideEffectsForTransition(index.android.bundle:198:9608)
          at s._receiveSignal(index.android.bundle:198:8309)
          at s.touchableHandleResponderRelease(index.android.bundle:198:5615)
          at Object.y(index.android.bundle:93:571)
          at P(index.android.bundle:93:714)`,
    };
    const stacktrace = computeStackTrace(REACT_NATIVE_V8_EXCEPTION);
    expect(stacktrace.stack).toEqual([
      { url: 'index.android.bundle', func: 'Object.onPress', args: [], line: 2342, column: 3773 },
      { url: 'index.android.bundle', func: 's.touchableHandlePress', args: [], line: 214, column: 2048 },
      { url: 'index.android.bundle', func: 's._performSideEffectsForTransition', args: [], line: 198, column: 9608 },
      { url: 'index.android.bundle', func: 's._receiveSignal', args: [], line: 198, column: 8309 },
      { url: 'index.android.bundle', func: 's.touchableHandleResponderRelease', args: [], line: 198, column: 5615 },
      { url: 'index.android.bundle', func: 'Object.y', args: [], line: 93, column: 571 },
      { url: 'index.android.bundle', func: 'P', args: [], line: 93, column: 714 },
    ]);
  });

  it('should parse exceptions for react-native Expo bundles', () => {
    const REACT_NATIVE_EXPO_EXCEPTION = {
      message: 'Test Error Expo',
      name: 'Error',
      stack: `onPress@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:595:658
          value@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:221:7656
          onResponderRelease@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:221:5666
          p@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:96:385
          forEach@[native code]`,
    };
    const stacktrace = computeStackTrace(REACT_NATIVE_EXPO_EXCEPTION);
    expect(stacktrace.stack).toEqual([
      {
        url:
          '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
        func: 'onPress',
        args: [],
        line: 595,
        column: 658,
      },
      {
        url:
          '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
        func: 'value',
        args: [],
        line: 221,
        column: 7656,
      },
      {
        url:
          '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
        func: 'onResponderRelease',
        args: [],
        line: 221,
        column: 5666,
      },
      {
        url:
          '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
        func: 'p',
        args: [],
        line: 96,
        column: 385,
      },
      {
        url: '[native code]',
        func: 'forEach',
        args: [],
        line: null,
        column: null,
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

      const stacktrace = computeStackTrace(CHROME73_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { args: [], column: 17, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        { args: [], column: null, func: 'Array.map', line: null, url: '<anonymous>' },
        { args: [], column: 19, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 7, func: '?', line: 24, url: 'http://localhost:5000/test' },
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

      const stacktrace = computeStackTrace(FIREFOX66_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { args: [], column: 17, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        { args: [], column: 19, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 7, func: '?', line: 24, url: 'http://localhost:5000/test' },
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

      const stacktrace = computeStackTrace(SAFARI12_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { args: [], column: 26, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        { args: [], column: null, func: 'map', line: null, url: '[native code]' },
        { args: [], column: 22, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 10, func: 'global code', line: 24, url: 'http://localhost:5000/test' },
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

      const stacktrace = computeStackTrace(EDGE44_NATIVE_CODE_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { args: [], column: 11, func: 'fooIterator', line: 20, url: 'http://localhost:5000/test' },
        {
          args: ['native code'],
          column: null,
          func: 'Array.prototype.map',
          line: null,
          url: 'native code',
        },
        { args: [], column: 9, func: 'foo', line: 19, url: 'http://localhost:5000/test' },
        { args: [], column: 7, func: 'Global code', line: 24, url: 'http://localhost:5000/test' },
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

      const stacktrace = computeStackTrace(CHROME73_EVAL_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { column: 13, url: 'http://localhost:5000/', func: 'Object.aha', line: 19, args: [] },
        { column: 16, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'Object.callback', line: 25, args: [] },
        { column: 17, url: 'http://localhost:5000/', func: '?', line: 34, args: [] },
        { column: null, url: '<anonymous>', func: 'Array.map', line: null, args: [] },
        { column: 23, url: 'http://localhost:5000/', func: 'test', line: 33, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'eval', line: 37, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'aha', line: 39, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'Foo.testMethod', line: 44, args: [] },
        { column: 19, url: 'http://localhost:5000/', func: '?', line: 50, args: [] },
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

      const stacktrace = computeStackTrace(FIREFOX66_EVAL_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { column: 13, url: 'http://localhost:5000/', func: 'aha', line: 19, args: [] },
        { column: 15, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'callback', line: 25, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'test/<', line: 34, args: [] },
        { column: 23, url: 'http://localhost:5000/', func: 'test', line: 33, args: [] },
        { column: null, url: 'http://localhost:5000/', func: 'eval', line: 39, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'aha', line: 39, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'testMethod', line: 44, args: [] },
        { column: 19, url: 'http://localhost:5000/', func: '?', line: 50, args: [] },
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

      const stacktrace = computeStackTrace(SAFARI12_EVAL_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { column: 22, url: 'http://localhost:5000/', func: 'aha', line: 19, args: [] },
        { column: null, url: '[native code]', func: 'aha', line: null, args: [] },
        { column: 16, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, args: [] },
        { column: 23, url: 'http://localhost:5000/', func: 'callback', line: 25, args: [] },
        { column: 25, url: 'http://localhost:5000/', func: '?', line: 34, args: [] },
        { column: null, url: '[native code]', func: 'map', line: null, args: [] },
        { column: 26, url: 'http://localhost:5000/', func: 'test', line: 33, args: [] },
        { column: null, url: '[native code]', func: 'eval', line: null, args: [] },
        { column: 9, url: 'http://localhost:5000/', func: 'aha', line: 39, args: [] },
        { column: 10, url: 'http://localhost:5000/', func: 'testMethod', line: 44, args: [] },
        { column: 29, url: 'http://localhost:5000/', func: '?', line: 50, args: [] },
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

      const stacktrace = computeStackTrace(EDGE44_EVAL_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        { column: 7, url: 'http://localhost:5000/', func: 'aha', line: 19, args: [] },
        { column: 6, url: 'http://localhost:5000/', func: 'callAnotherThing', line: 18, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'callback', line: 25, args: [] },
        { column: 7, url: 'http://localhost:5000/', func: 'Anonymous function', line: 34, args: [] },
        {
          args: ['native code'],
          column: null,
          func: 'Array.prototype.map',
          line: null,
          url: 'native code',
        },
        { column: 5, url: 'http://localhost:5000/', func: 'test', line: 33, args: [] },
        { column: 1, url: 'eval code', func: 'eval code', line: 1, args: [] },
        { column: 5, url: 'http://localhost:5000/', func: 'aha', line: 39, args: [] },
        {
          args: [],
          column: 7,
          func: 'Foo.prototype.testMethod',
          line: 44,
          url: 'http://localhost:5000/',
        },
        { column: 8, url: 'http://localhost:5000/', func: 'Anonymous function', line: 50, args: [] },
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

      const stacktrace = computeStackTrace(CHROME_ELECTRON_RENDERER);

      expect(stacktrace.stack).toEqual([
        {
          args: [],
          column: 108,
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

      const stacktrace = computeStackTrace(REACT_INVARIANT_VIOLATION_EXCEPTION);

      expect(stacktrace.stack).toEqual([
        {
          args: [],
          column: 21738,
          func: '?',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 21841,
          func: 'a',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 68735,
          func: 'ho',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 980,
          func: 'f',
          line: 1,
          url: 'http://localhost:5000/',
        },
      ]);
    });

    it('should correctly parse production errors and drop initial frame if its not relevant', () => {
      const REACT_PRODUCTION_ERROR = {
        message:
          'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
        name: 'Error',
        stack: `Error: Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
          at http://localhost:5000/static/js/foo.chunk.js:1:21738
          at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
          at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
          at f (http://localhost:5000/:1:980)`,
      };

      const stacktrace = computeStackTrace(REACT_PRODUCTION_ERROR);

      expect(stacktrace.stack).toEqual([
        {
          args: [],
          column: 21738,
          func: '?',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 21841,
          func: 'a',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 68735,
          func: 'ho',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 980,
          func: 'f',
          line: 1,
          url: 'http://localhost:5000/',
        },
      ]);
    });

    it('should not drop additional frame for production errors if framesToPop is still there', () => {
      const REACT_PRODUCTION_ERROR = {
        framesToPop: 1,
        message:
          'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
        name: 'Error',
        stack: `Error: Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
          at http://localhost:5000/static/js/foo.chunk.js:1:21738
          at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
          at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
          at f (http://localhost:5000/:1:980)`,
      };

      const stacktrace = computeStackTrace(REACT_PRODUCTION_ERROR);

      expect(stacktrace.stack).toEqual([
        {
          args: [],
          column: 21738,
          func: '?',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 21841,
          func: 'a',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 68735,
          func: 'ho',
          line: 1,
          url: 'http://localhost:5000/static/js/foo.chunk.js',
        },
        {
          args: [],
          column: 980,
          func: 'f',
          line: 1,
          url: 'http://localhost:5000/',
        },
      ]);
    });
  });
});
