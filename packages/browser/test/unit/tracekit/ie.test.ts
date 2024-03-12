import { createStackParser } from '@sentry/utils';
import { exceptionFromError } from '../../../src/eventbuilder';
import { chromeStackLineParser, geckoStackLineParser, winjsStackLineParser } from '../../../src/stack-parsers';

const parser = createStackParser(chromeStackLineParser, geckoStackLineParser, winjsStackLineParser);

describe('Tracekit - IE Tests', () => {
  it('should parse IE 10 error', () => {
    const IE_10 = {
      name: 'foo',
      message: "Unable to get property 'undef' of undefined or null reference",
      stack:
        "TypeError: Unable to get property 'undef' of undefined or null reference\n" +
        '   at Anonymous function (http://path/to/file.js:48:13)\n' +
        '   at foo (http://path/to/file.js:46:9)\n' +
        '   at bar (http://path/to/file.js:82:1)',
      description: "Unable to get property 'undef' of undefined or null reference",
      number: -2146823281,
    };

    const ex = exceptionFromError(parser, IE_10);

    // TODO: func should be normalized
    expect(ex).toEqual({
      value: "Unable to get property 'undef' of undefined or null reference",
      type: 'foo',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 82, colno: 1, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 46, colno: 9, in_app: true },
          { filename: 'http://path/to/file.js', function: 'Anonymous function', lineno: 48, colno: 13, in_app: true },
        ],
      },
    });
  });

  it('should parse IE 11 error', () => {
    const IE_11 = {
      message: "Unable to get property 'undef' of undefined or null reference",
      name: 'TypeError',
      stack:
        "TypeError: Unable to get property 'undef' of undefined or null reference\n" +
        '   at Anonymous function (http://path/to/file.js:47:21)\n' +
        '   at foo (http://path/to/file.js:45:13)\n' +
        '   at bar (http://path/to/file.js:108:1)',
      description: "Unable to get property 'undef' of undefined or null reference",
      number: -2146823281,
    };

    const ex = exceptionFromError(parser, IE_11);

    // TODO: func should be normalized
    expect(ex).toEqual({
      value: "Unable to get property 'undef' of undefined or null reference",
      type: 'TypeError',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 108, colno: 1, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 45, colno: 13, in_app: true },
          { filename: 'http://path/to/file.js', function: 'Anonymous function', lineno: 47, colno: 21, in_app: true },
        ],
      },
    });
  });

  it('should parse IE 11 eval error', () => {
    const IE_11_EVAL = {
      message: "'getExceptionProps' is undefined",
      name: 'ReferenceError',
      stack:
        "ReferenceError: 'getExceptionProps' is undefined\n" +
        '   at eval code (eval code:1:1)\n' +
        '   at foo (http://path/to/file.js:58:17)\n' +
        '   at bar (http://path/to/file.js:109:1)',
      description: "'getExceptionProps' is undefined",
      number: -2146823279,
    };

    const ex = exceptionFromError(parser, IE_11_EVAL);

    expect(ex).toEqual({
      value: "'getExceptionProps' is undefined",
      type: 'ReferenceError',
      stacktrace: {
        frames: [
          { filename: 'http://path/to/file.js', function: 'bar', lineno: 109, colno: 1, in_app: true },
          { filename: 'http://path/to/file.js', function: 'foo', lineno: 58, colno: 17, in_app: true },
          { filename: 'eval code', function: 'eval code', lineno: 1, colno: 1, in_app: true },
        ],
      },
    });
  });
});
