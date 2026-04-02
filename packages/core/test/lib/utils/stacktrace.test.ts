import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeStackLineParser } from '../../../src/utils/node-stack-trace';
import { createStackParser, stripSentryFramesAndReverse } from '../../../src/utils/stacktrace';

describe('Stacktrace', () => {
  describe('createStackParser()', () => {
    it('skips lines that contain "Error: " (e.g. "TypeError: foo")', () => {
      const mockParser = vi.fn().mockReturnValue({ filename: 'test.js', function: 'test', lineno: 1, colno: 1 });
      const parser = createStackParser([0, mockParser]);

      const stack = ['TypeError: foo is not a function', '    at test (test.js:1:1)'].join('\n');

      const frames = parser(stack);

      // The parser should only be called for the frame line, not the Error line
      expect(mockParser).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(1);
    });

    it('skips various Error type lines', () => {
      const mockParser = vi.fn().mockReturnValue({ filename: 'test.js', function: 'test', lineno: 1, colno: 1 });
      const parser = createStackParser([0, mockParser]);

      const stack = [
        'Error: something went wrong',
        'TypeError: foo is not a function',
        'RangeError: Maximum call stack size exceeded',
        'SomeCustomError: custom message',
        '    at test (test.js:1:1)',
      ].join('\n');

      const frames = parser(stack);

      // Only the frame line should be parsed, all Error lines should be skipped
      expect(mockParser).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(1);
    });

    // Regression test for https://github.com/getsentry/sentry-javascript/issues/20052
    it('processes long non-whitespace lines without hanging', () => {
      const mockParser = vi.fn().mockReturnValue(undefined);
      const parser = createStackParser([0, mockParser]);

      // Long non-whitespace lines (e.g. minified URLs) previously caused O(n²) backtracking
      const longLine = 'a'.repeat(2000);
      const stack = [longLine, '    at test (test.js:1:1)'].join('\n');

      // Should complete without hanging (line gets truncated to 1024 chars internally)
      parser(stack);
      expect(mockParser).toHaveBeenCalledTimes(2);
    });

    it('does not skip lines that do not contain "Error: "', () => {
      const mockParser = vi.fn().mockReturnValue({ filename: 'test.js', function: 'test', lineno: 1, colno: 1 });
      const parser = createStackParser([0, mockParser]);

      const stack = [
        '    at foo (test.js:1:1)',
        '    at bar (test.js:2:1)',
        'ResizeObserver loop completed with undelivered notifications.',
      ].join('\n');

      parser(stack);

      // All lines should be attempted by the parser (none contain "Error: ")
      expect(mockParser).toHaveBeenCalledTimes(3);
    });
  });

  describe('stripSentryFramesAndReverse()', () => {
    describe('removed top frame if its internally reserved word (public API)', () => {
      it('reserved captureException', () => {
        const stack = [
          { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureException' },
          { colno: 1, lineno: 3, filename: 'anything.js', function: 'foo' },
          { colno: 1, lineno: 2, filename: 'anything.js', function: 'bar' },
        ];

        // Should remove `captureException` as its a name considered "internal"
        const frames = stripSentryFramesAndReverse(stack);

        expect(frames.length).toBe(2);
        expect(frames[0]?.function).toBe('bar');
        expect(frames[1]?.function).toBe('foo');
      });

      it('reserved captureMessage', () => {
        const stack = [
          { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' },
          { colno: 1, lineno: 3, filename: 'anything.js', function: 'foo' },
          { colno: 1, lineno: 2, filename: 'anything.js', function: 'bar' },
        ];

        // Should remove `captureMessage` as its a name considered "internal"
        const frames = stripSentryFramesAndReverse(stack);

        expect(frames.length).toBe(2);
        expect(frames[0]?.function).toBe('bar');
        expect(frames[1]?.function).toBe('foo');
      });

      it('remove two occurences if they are present', () => {
        const exceptionStack = [
          { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureException' },
          { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureException' },
          { colno: 1, lineno: 3, filename: 'anything.js', function: 'foo' },
          { colno: 1, lineno: 2, filename: 'anything.js', function: 'bar' },
        ];

        const exceptionFrames = stripSentryFramesAndReverse(exceptionStack);

        expect(exceptionFrames.length).toBe(2);
        expect(exceptionFrames[0]?.function).toBe('bar');
        expect(exceptionFrames[1]?.function).toBe('foo');

        const messageStack = [
          { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' },
          { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' },
          { colno: 1, lineno: 3, filename: 'anything.js', function: 'foo' },
          { colno: 1, lineno: 2, filename: 'anything.js', function: 'bar' },
        ];

        const messageFrames = stripSentryFramesAndReverse(messageStack);

        expect(messageFrames.length).toBe(2);
        expect(messageFrames[0]?.function).toBe('bar');
        expect(messageFrames[1]?.function).toBe('foo');
      });
    });

    describe('removed bottom frame if its internally reserved word (internal API)', () => {
      it('reserved sentryWrapped', () => {
        const stack = [
          { colno: 1, lineno: 3, filename: 'anything.js', function: 'foo' },
          { colno: 1, lineno: 2, filename: 'anything.js', function: 'bar' },
          { colno: 1, lineno: 1, filename: 'anything.js', function: 'sentryWrapped' },
        ];

        // Should remove `sentryWrapped` as its a name considered "internal"
        const frames = stripSentryFramesAndReverse(stack);

        expect(frames.length).toBe(2);
        expect(frames[0]?.function).toBe('bar');
        expect(frames[1]?.function).toBe('foo');
      });
    });

    it('removed top and bottom frame if they are internally reserved words', () => {
      const stack = [
        { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' },
        { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' },
        { colno: 1, lineno: 3, filename: 'anything.js', function: 'foo' },
        { colno: 1, lineno: 2, filename: 'anything.js', function: 'bar' },
        { colno: 1, lineno: 1, filename: 'anything.js', function: 'sentryWrapped' },
      ];

      // Should remove `captureMessage` and `sentryWrapped` as its a name considered "internal"
      const frames = stripSentryFramesAndReverse(stack);

      expect(frames.length).toBe(2);
      expect(frames[0]?.function).toBe('bar');
      expect(frames[1]?.function).toBe('foo');
    });

    it('applies frames limit after the stripping, not before', () => {
      const stack = Array.from({ length: 55 }).map((_, i) => {
        return { colno: 1, lineno: 4, filename: 'anything.js', function: `${i}` };
      });

      stack.unshift({ colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' });
      stack.unshift({ colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' });
      stack.push({ colno: 1, lineno: 4, filename: 'anything.js', function: 'sentryWrapped' });

      // Should remove 2x `captureMessage`, `sentryWrapped`, and then limit frames to default 50.
      const frames = stripSentryFramesAndReverse(stack);

      expect(frames.length).toBe(50);

      // Frames are named 0-54, thus after reversal and trimming, we should have frames 54-5, 50 in total.
      expect(frames[0]?.function).toBe('54');
      expect(frames[49]?.function).toBe('5');
    });
  });
});

describe('node', () => {
  const mockGetModule = vi.fn();
  const parser = nodeStackLineParser(mockGetModule);
  const node = parser[1];

  beforeEach(() => {
    mockGetModule.mockReset();
  });

  it('should return undefined for invalid input', () => {
    expect(node('invalid input')).toBeUndefined();
  });

  it('should extract function, module, filename, lineno, colno, and in_app from valid input', () => {
    const input = 'at myFunction (/path/to/file.js:10:5)';

    const expectedOutput = {
      filename: '/path/to/file.js',
      module: undefined,
      function: 'myFunction',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('extracts module from getModule', () => {
    const input = 'at myFunction (/path/to/file.js:10:5)';
    mockGetModule.mockReturnValue('myModule');
    expect(node(input)?.module).toEqual('myModule');
  });

  it('should extract anonymous function name correctly', () => {
    const input = 'at /path/to/file.js:10:5';

    const expectedOutput = {
      filename: '/path/to/file.js',
      module: undefined,
      function: '?',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('should extract method name and type name correctly', () => {
    const input = 'at myObject.myMethod (/path/to/file.js:10:5)';

    const expectedOutput = {
      filename: '/path/to/file.js',
      module: undefined,
      function: 'myObject.myMethod',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('should handle input with file:// protocol', () => {
    const input = 'at myFunction (file:///path/to/file.js:10:5)';

    const expectedOutput = {
      filename: '/path/to/file.js',
      module: undefined,
      function: 'myFunction',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('should handle input with no line or column number', () => {
    const input = 'at myFunction (/path/to/file.js)';

    const expectedOutput = {
      filename: '/path/to/file.js',
      module: undefined,
      function: 'myFunction',
      lineno: undefined,
      colno: undefined,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('should handle input with "native" flag', () => {
    const input = 'at myFunction (native)';

    const expectedOutput = {
      filename: undefined,
      module: undefined,
      function: 'myFunction',
      lineno: undefined,
      colno: undefined,
      in_app: false,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('should correctly parse a stack trace line with a function name and file URL', () => {
    const line = 'at myFunction (file:///path/to/myFile.js:10:20)';
    const result = node(line);
    expect(result).toEqual({
      filename: '/path/to/myFile.js',
      function: 'myFunction',
      lineno: 10,
      colno: 20,
      in_app: true,
    });
  });

  it('should correctly parse a stack trace line with a method name and filename', () => {
    const line = 'at MyClass.myMethod (/path/to/myFile.js:10:20)';
    const result = node(line);
    expect(result).toEqual({
      filename: '/path/to/myFile.js',
      module: undefined,
      function: 'MyClass.myMethod',
      lineno: 10,
      colno: 20,
      in_app: true,
    });
  });

  it('should correctly parse a stack trace line with an anonymous function', () => {
    const line = 'at Object.<anonymous> (/path/to/myFile.js:10:20)';
    const result = node(line);

    expect(result).toEqual({
      filename: '/path/to/myFile.js',
      function: 'Object.?',
      lineno: 10,
      colno: 20,
      in_app: true,
    });
  });

  it('should correctly parse a stack trace line with no function or filename', () => {
    const line = 'at /path/to/myFile.js:10:20';
    const result = node(line);
    expect(result).toEqual({
      filename: '/path/to/myFile.js',
      function: '?',
      lineno: 10,
      colno: 20,
      in_app: true,
    });
  });

  it('should correctly parse a stack trace line with a native function', () => {
    const line = 'at Object.<anonymous> (native)';
    const result = node(line);
    expect(result).toEqual({
      filename: undefined,
      function: 'Object.?',
      lineno: undefined,
      colno: undefined,
      in_app: false,
    });
  });

  it('should correctly parse a stack trace line with a module filename', () => {
    const line = 'at Object.<anonymous> (/path/to/node_modules/myModule/index.js:10:20)';
    const result = node(line);

    expect(result).toEqual({
      filename: '/path/to/node_modules/myModule/index.js',
      function: 'Object.?',
      lineno: 10,
      colno: 20,
      in_app: false,
    });
  });

  it('should correctly parse a stack trace line with a Windows filename', () => {
    const line = 'at Object.<anonymous> (C:\\path\\to\\myFile.js:10:20)';
    const result = node(line);
    expect(result).toEqual({
      filename: 'C:\\path\\to\\myFile.js',
      function: 'Object.?',
      lineno: 10,
      colno: 20,
      in_app: true,
    });
  });

  it('should mark frames with protocols as in_app: true', () => {
    const line = 'at Object.<anonymous> (app:///_next/server/pages/[error].js:10:20)';
    const result = node(line);
    expect(result?.in_app).toBe(true);
  });

  it('parses frame filename paths with spaces and characters in file name', () => {
    const input = 'at myObject.myMethod (/path/to/file with space(1).js:10:5)';

    const expectedOutput = {
      filename: '/path/to/file with space(1).js',
      module: undefined,
      function: 'myObject.myMethod',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('parses frame filename paths with spaces and characters in file path', () => {
    const input = 'at myObject.myMethod (/path with space(1)/to/file.js:10:5)';

    const expectedOutput = {
      filename: '/path with space(1)/to/file.js',
      module: undefined,
      function: 'myObject.myMethod',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('parses encoded frame filename paths with spaces and characters in file name', () => {
    const input = 'at myObject.myMethod (/path/to/file%20with%20space(1).js:10:5)';

    const expectedOutput = {
      filename: '/path/to/file with space(1).js',
      module: undefined,
      function: 'myObject.myMethod',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('parses encoded frame filename paths with spaces and characters in file path', () => {
    const input = 'at myObject.myMethod (/path%20with%20space(1)/to/file.js:10:5)';

    const expectedOutput = {
      filename: '/path with space(1)/to/file.js',
      module: undefined,
      function: 'myObject.myMethod',
      lineno: 10,
      colno: 5,
      in_app: true,
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('parses function name when filename is a data uri ', () => {
    const input =
      "at dynamicFn (data:application/javascript,export function dynamicFn() {  throw new Error('Error from data-uri module');};:1:38)";

    const expectedOutput = {
      function: 'dynamicFn',
      filename: '<data:application/javascript>',
    };

    expect(node(input)).toEqual(expectedOutput);
  });

  it('returns the raw filename when decodeURI throws a URIError', () => {
    const malformedFilename = '/path/to/%file%.js';
    const input = `at myFunction (${malformedFilename}:10:5)`;

    const result = node(input);

    expect(result?.filename).toBe('/path/to/%file%.js');
  });

  it('decodes a valid percent-encoded filename', () => {
    const input = 'at myFunction (/path/to/my%20file.js:10:5)';

    const result = node(input);

    expect(result?.filename).toBe('/path/to/my file.js');
  });
});
