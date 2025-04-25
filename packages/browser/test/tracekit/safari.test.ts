import { describe, expect, it } from 'vitest';
import { exceptionFromError } from '../../src/eventbuilder';
import { defaultStackParser as parser } from '../../src/stack-parsers';

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

    const stackFrames = exceptionFromError(parser, SAFARI_6);

    expect(stackFrames).toEqual({
      value: "'null' is not an object (evaluating 'x.undef')",
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: '[native code]', function: '?', in_app: true },
          { filename: 'http://path/to/file.js', function: 'onclick', lineno: 82, in_app: true },
          { filename: 'http://path/to/file.js', function: 'dumpException3', lineno: 52, in_app: true },
          { filename: 'http://path/to/file.js', function: '?', lineno: 48, in_app: true },
        ],
      },
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

    const stackFrames = exceptionFromError(parser, SAFARI_7);

    expect(stackFrames).toEqual({
      value: "'null' is not an object (evaluating 'x.undef')",
      type: 'TypeError',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 108, colno: 107, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 52, colno: 15, in_app: true },
          { filename: 'http://path/to/file.js', function: '?', lineno: 48, colno: 22, in_app: true },
        ],
      },
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

    const stackFrames = exceptionFromError(parser, SAFARI_8);

    expect(stackFrames).toEqual({
      value: "null is not an object (evaluating 'x.undef')",
      type: 'TypeError',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 108, colno: 23, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 52, colno: 15, in_app: true },
          { filename: 'http://path/to/file.js', function: '?', lineno: 47, colno: 22, in_app: true },
        ],
      },
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

    const stackFrames = exceptionFromError(parser, SAFARI_8_EVAL);

    expect(stackFrames).toEqual({
      value: "Can't find variable: getExceptionProps",
      type: 'ReferenceError',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 109, colno: 91, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 58, colno: 21, in_app: true },
          { filename: '[native code]', function: 'eval', in_app: true },
        ],
      },
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

      const ex = exceptionFromError(parser, SAFARI_EXTENSION_EXCEPTION);

      expect(ex).toEqual({
        value: 'wat',
        type: 'Error',
        stacktrace: {
          frames: [
            {
              filename: 'safari-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js',
              function: '?',
              lineno: 3313,
              colno: 26,
              in_app: true,
            },
            {
              filename: 'safari-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js',
              function: 'ClipperError',
              lineno: 223036,
              colno: 10,
              in_app: true,
            },
          ],
        },
      });
    });

    it('should parse exceptions for safari-extension with frames-only stack', () => {
      const SAFARI_EXTENSION_EXCEPTION = {
        message: "undefined is not an object (evaluating 'e.groups.includes')",
        name: 'TypeError',
        stack: `isClaimed@safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js:2:929865
        safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js:2:1588410
        promiseReactionJob@[native code]`,
      };
      const ex = exceptionFromError(parser, SAFARI_EXTENSION_EXCEPTION);

      expect(ex).toEqual({
        value: "undefined is not an object (evaluating 'e.groups.includes')",
        type: 'TypeError',
        stacktrace: {
          frames: [
            { filename: '[native code]', function: 'promiseReactionJob', in_app: true },
            {
              filename: 'safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js',
              function: '?',
              lineno: 2,
              colno: 1588410,
              in_app: true,
            },
            {
              filename: 'safari-extension://com.grammarly.safari.extension.ext2-W8F64X92K3/ee7759dd/Grammarly.js',
              function: 'isClaimed',
              lineno: 2,
              colno: 929865,
              in_app: true,
            },
          ],
        },
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

      const ex = exceptionFromError(parser, SAFARI_WEB_EXTENSION_EXCEPTION);

      expect(ex).toEqual({
        value: 'wat',
        type: 'Error',
        stacktrace: {
          frames: [
            {
              filename: 'safari-web-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/topee-content.js',
              function: '?',
              lineno: 3313,
              colno: 26,
              in_app: true,
            },
            {
              filename: 'safari-web-extension://3284871F-A480-4FFC-8BC4-3F362C752446/2665fee0/commons.js',
              function: 'ClipperError',
              lineno: 223036,
              colno: 10,
              in_app: true,
            },
          ],
        },
      });
    });

    it('should parse exceptions for safari-web-extension with frames-only stack', () => {
      const SAFARI_EXTENSION_EXCEPTION = {
        message: "undefined is not an object (evaluating 'e.groups.includes')",
        name: 'TypeError',
        stack: `p_@safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js:29:33314
      safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js:29:56027
      promiseReactionJob@[native code]`,
      };
      const ex = exceptionFromError(parser, SAFARI_EXTENSION_EXCEPTION);

      expect(ex).toEqual({
        value: "undefined is not an object (evaluating 'e.groups.includes')",
        type: 'TypeError',
        stacktrace: {
          frames: [
            { filename: '[native code]', function: 'promiseReactionJob', in_app: true },
            {
              filename: 'safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js',
              function: '?',
              lineno: 29,
              colno: 56027,
              in_app: true,
            },
            {
              filename: 'safari-web-extension://46434E60-F5BD-48A4-80C8-A422C5D16897/scripts/content-script.js',
              function: 'p_',
              lineno: 29,
              colno: 33314,
              in_app: true,
            },
          ],
        },
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

    const ex = exceptionFromError(parser, SAFARI12_NATIVE_CODE_EXCEPTION);

    expect(ex).toEqual({
      value: 'test',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/test', function: 'global code', lineno: 24, colno: 10, in_app: true },
          { filename: 'http://localhost:5000/test', function: 'foo', lineno: 19, colno: 22, in_app: true },
          { filename: '[native code]', function: 'map', in_app: true },
          { filename: 'http://localhost:5000/test', function: 'fooIterator', lineno: 20, colno: 26, in_app: true },
        ],
      },
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

    const ex = exceptionFromError(parser, SAFARI12_EVAL_EXCEPTION);

    expect(ex).toEqual({
      value: 'aha',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: '?', lineno: 50, colno: 29, in_app: true },
          { filename: 'http://localhost:5000/', function: 'testMethod', lineno: 44, colno: 10, in_app: true },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 39, colno: 9, in_app: true },
          { filename: '[native code]', function: 'eval', in_app: true },
          { filename: 'http://localhost:5000/', function: 'test', lineno: 33, colno: 26, in_app: true },
          { filename: '[native code]', function: 'map', in_app: true },
          { filename: 'http://localhost:5000/', function: '?', lineno: 34, colno: 25, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callback', lineno: 25, colno: 23, in_app: true },
          { filename: 'http://localhost:5000/', function: 'callAnotherThing', lineno: 20, colno: 16, in_app: true },
          { filename: '[native code]', function: 'aha', in_app: true },
          { filename: 'http://localhost:5000/', function: 'aha', lineno: 19, colno: 22, in_app: true },
        ],
      },
    });
  });

  it('should correctly parse parentheses', () => {
    const PARENTHESIS_FRAME_EXCEPTION = {
      message: 'aha',
      name: 'Error',
      stack:
        '@http://localhost:3000/(group)/[route]/script.js:1:131\n' +
        'global code@http://localhost:3000/(group)/[route]/script.js:1:334',
    };

    const ex = exceptionFromError(parser, PARENTHESIS_FRAME_EXCEPTION);

    expect(ex).toEqual({
      value: 'aha',
      type: 'Error',
      stacktrace: {
        frames: [
          {
            colno: 334,
            filename: 'http://localhost:3000/(group)/[route]/script.js',
            function: 'global code',
            in_app: true,
            lineno: 1,
          },
          {
            colno: 131,
            filename: 'http://localhost:3000/(group)/[route]/script.js',
            function: '?',
            in_app: true,
            lineno: 1,
          },
        ],
      },
    });
  });
});
