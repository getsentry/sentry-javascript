import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - Safari Tests', () => {
  it('should parse Safari 6 error', () => {
    const SAFARI_6 = {
      name: 'foo',
      message: "'null' is not an object (evaluating 'x.undef')",
      stack:
        '@http://path/to/file.js:48\n' +
        'dumpException3@http://path/to/file.js:52\n' +
        'onclick@http://path/to/file.js:82\n' +
        '[native code]',
      line: 48,
      sourceURL: 'http://path/to/file.js',
    };

    const stackFrames = computeStackTrace(SAFARI_6);

    expect(stackFrames).toEqual({
      message: "'null' is not an object (evaluating 'x.undef')",
      name: 'foo',
      stack: [
        { url: 'http://path/to/file.js', func: '?', line: 48, column: null },
        { url: 'http://path/to/file.js', func: 'dumpException3', line: 52, column: null },
        { url: 'http://path/to/file.js', func: 'onclick', line: 82, column: null },
        { url: '[native code]', func: '?', line: null, column: null },
      ],
    });
  });

  it('should parse Safari 7 error', () => {
    const SAFARI_7 = {
      message: "'null' is not an object (evaluating 'x.undef')",
      name: 'TypeError',
      stack:
        'http://path/to/file.js:48:22\n' + 'foo@http://path/to/file.js:52:15\n' + 'bar@http://path/to/file.js:108:107',
      line: 47,
      sourceURL: 'http://path/to/file.js',
    };

    const stackFrames = computeStackTrace(SAFARI_7);

    expect(stackFrames).toEqual({
      message: "'null' is not an object (evaluating 'x.undef')",
      name: 'TypeError',
      stack: [
        { url: 'http://path/to/file.js', func: '?', line: 48, column: 22 },
        { url: 'http://path/to/file.js', func: 'foo', line: 52, column: 15 },
        { url: 'http://path/to/file.js', func: 'bar', line: 108, column: 107 },
      ],
    });
  });

  it('should parse Safari 8 error', () => {
    const SAFARI_8 = {
      message: "null is not an object (evaluating 'x.undef')",
      name: 'TypeError',
      stack:
        'http://path/to/file.js:47:22\n' + 'foo@http://path/to/file.js:52:15\n' + 'bar@http://path/to/file.js:108:23',
      line: 47,
      column: 22,
      sourceURL: 'http://path/to/file.js',
    };

    const stackFrames = computeStackTrace(SAFARI_8);

    expect(stackFrames).toEqual({
      message: "null is not an object (evaluating 'x.undef')",
      name: 'TypeError',
      stack: [
        { url: 'http://path/to/file.js', func: '?', line: 47, column: 22 },
        { url: 'http://path/to/file.js', func: 'foo', line: 52, column: 15 },
        { url: 'http://path/to/file.js', func: 'bar', line: 108, column: 23 },
      ],
    });
  });

  it('should parse Safari 8 eval error', () => {
    // TODO: Take into account the line and column properties on the error object and use them for the first stack trace.

    const SAFARI_8_EVAL = {
      message: "Can't find variable: getExceptionProps",
      name: 'ReferenceError',
      stack:
        'eval code\n' +
        'eval@[native code]\n' +
        'foo@http://path/to/file.js:58:21\n' +
        'bar@http://path/to/file.js:109:91',
      line: 1,
      column: 18,
    };

    const stackFrames = computeStackTrace(SAFARI_8_EVAL);

    expect(stackFrames).toEqual({
      message: "Can't find variable: getExceptionProps",
      name: 'ReferenceError',
      stack: [
        { url: '[native code]', func: 'eval', line: null, column: null },
        { url: 'http://path/to/file.js', func: 'foo', line: 58, column: 21 },
        { url: 'http://path/to/file.js', func: 'bar', line: 109, column: 91 },
      ],
    });
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

      expect(stacktrace).toEqual({
        message: 'wat',
        name: 'Error',
        stack: [
          {
            url: 'safari-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js',
            func: 'ClipperError',
            line: 223036,
            column: 10,
          },
          {
            url: 'safari-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js',
            func: '?',
            line: 3313,
            column: 26,
          },
        ],
      });
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

      expect(stacktrace).toEqual({
        message: "undefined is not an object (evaluating 'e.groups.includes')",
        name: 'TypeError',
        stack: [
          {
            url: 'safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js',
            func: 'isClaimed',
            line: 2,
            column: 929865,
          },
          {
            url: 'safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js',
            func: '?',
            line: 2,
            column: 1588410,
          },
          { url: '[native code]', func: 'promiseReactionJob', line: null, column: null },
        ],
      });
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

      expect(stacktrace).toEqual({
        message: 'wat',
        name: 'Error',
        stack: [
          {
            url: 'safari-web-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js',
            func: 'ClipperError',
            line: 223036,
            column: 10,
          },
          {
            url: 'safari-web-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js',
            func: '?',
            line: 3313,
            column: 26,
          },
        ],
      });
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

      expect(stacktrace).toEqual({
        message: "undefined is not an object (evaluating 'e.groups.includes')",
        name: 'TypeError',
        stack: [
          {
            url: 'safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js',
            func: 'p_',
            line: 29,
            column: 33314,
          },
          {
            url: 'safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js',
            func: '?',
            line: 29,
            column: 56027,
          },
          { url: '[native code]', func: 'promiseReactionJob', line: null, column: null },
        ],
      });
    });
  });

  it('should parse exceptions with native code frames in Safari 12', () => {
    const SAFARI12_NATIVE_CODE_EXCEPTION = {
      message: 'test',
      name: 'Error',
      stack: `fooIterator@http://localhost:5000/test:20:26
          map@[native code]
          foo@http://localhost:5000/test:19:22
          global code@http://localhost:5000/test:24:10`,
    };

    const stacktrace = computeStackTrace(SAFARI12_NATIVE_CODE_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'test',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/test', func: 'fooIterator', line: 20, column: 26 },
        { url: '[native code]', func: 'map', line: null, column: null },
        { url: 'http://localhost:5000/test', func: 'foo', line: 19, column: 22 },
        { url: 'http://localhost:5000/test', func: 'global code', line: 24, column: 10 },
      ],
    });
  });

  it('should parse exceptions with eval frames in Safari 12', () => {
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

    expect(stacktrace).toEqual({
      message: 'aha',
      name: 'Error',
      stack: [
        { url: 'http://localhost:5000/', func: 'aha', line: 19, column: 22 },
        { url: '[native code]', func: 'aha', line: null, column: null },
        { url: 'http://localhost:5000/', func: 'callAnotherThing', line: 20, column: 16 },
        { url: 'http://localhost:5000/', func: 'callback', line: 25, column: 23 },
        { url: 'http://localhost:5000/', func: '?', line: 34, column: 25 },
        { url: '[native code]', func: 'map', line: null, column: null },
        { url: 'http://localhost:5000/', func: 'test', line: 33, column: 26 },
        { url: '[native code]', func: 'eval', line: null, column: null },
        { url: 'http://localhost:5000/', func: 'aha', line: 39, column: 9 },
        { url: 'http://localhost:5000/', func: 'testMethod', line: 44, column: 10 },
        { url: 'http://localhost:5000/', func: '?', line: 50, column: 29 },
      ],
    });
  });
});
