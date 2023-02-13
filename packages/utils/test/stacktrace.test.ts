import { stripSentryFramesAndReverse } from '../src/stacktrace';

describe('Stacktrace', () => {
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
        expect(frames[0].function).toBe('bar');
        expect(frames[1].function).toBe('foo');
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
        expect(frames[0].function).toBe('bar');
        expect(frames[1].function).toBe('foo');
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
        expect(frames[0].function).toBe('bar');
        expect(frames[1].function).toBe('foo');
      });
    });

    it('removed top and bottom frame if they are internally reserved words', () => {
      const stack = [
        { colno: 1, lineno: 4, filename: 'anything.js', function: 'captureMessage' },
        { colno: 1, lineno: 3, filename: 'anything.js', function: 'foo' },
        { colno: 1, lineno: 2, filename: 'anything.js', function: 'bar' },
        { colno: 1, lineno: 1, filename: 'anything.js', function: 'sentryWrapped' },
      ];

      // Should remove `captureMessage` and `sentryWrapped` as its a name considered "internal"
      const frames = stripSentryFramesAndReverse(stack);

      expect(frames.length).toBe(2);
      expect(frames[0].function).toBe('bar');
      expect(frames[1].function).toBe('foo');
    });
  });
});
