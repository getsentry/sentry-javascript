import { computeStackTrace } from '../../../src/tracekit';

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

    const stackFrames = computeStackTrace(IE_10);

    // TODO: func should be normalized
    expect(stackFrames).toEqual({
      message: "Unable to get property 'undef' of undefined or null reference",
      name: 'foo',
      stack: [
        { url: 'http://path/to/file.js', func: 'Anonymous function', line: 48, column: 13 },
        { url: 'http://path/to/file.js', func: 'foo', line: 46, column: 9 },
        { url: 'http://path/to/file.js', func: 'bar', line: 82, column: 1 },
      ],
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

    const stackFrames = computeStackTrace(IE_11);

    // TODO: func should be normalized
    expect(stackFrames).toEqual({
      message: "Unable to get property 'undef' of undefined or null reference",
      name: 'TypeError',
      stack: [
        { url: 'http://path/to/file.js', func: 'Anonymous function', line: 47, column: 21 },
        { url: 'http://path/to/file.js', func: 'foo', line: 45, column: 13 },
        { url: 'http://path/to/file.js', func: 'bar', line: 108, column: 1 },
      ],
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

    const stackFrames = computeStackTrace(IE_11_EVAL);

    expect(stackFrames).toEqual({
      message: "'getExceptionProps' is undefined",
      name: 'ReferenceError',
      stack: [
        { url: 'eval code', func: 'eval code', line: 1, column: 1 },
        { url: 'http://path/to/file.js', func: 'foo', line: 58, column: 17 },
        { url: 'http://path/to/file.js', func: 'bar', line: 109, column: 1 },
      ],
    });
  });
});
