import { describe, expect, it, vi } from 'vitest';
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

