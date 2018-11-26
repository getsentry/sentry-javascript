import { expect } from 'chai';
import { prepareFramesForEvent } from '../src/parsers';

describe('Parsers', () => {
  describe('prepareFramesForEvent()', () => {
    describe('removed top frame if its internally reserved word (public API)', async () => {
      it('reserved captureException', () => {
        const stack = [
          { context: ['x'], column: 1, line: 4, url: 'anything.js', func: 'captureException', args: [] },
          { context: ['x'], column: 1, line: 3, url: 'anything.js', func: 'foo', args: [] },
          { context: ['x'], column: 1, line: 2, url: 'anything.js', func: 'bar', args: [] },
        ];

        // Should remove `captureException` as its a name considered "internal"
        const frames = prepareFramesForEvent(stack);

        expect(frames.length).equal(2);
        expect(frames[0].function).equal('bar');
        expect(frames[1].function).equal('foo');
      });

      it('reserved captureMessage', () => {
        const stack = [
          { context: ['x'], column: 1, line: 4, url: 'anything.js', func: 'captureMessage', args: [] },
          { context: ['x'], column: 1, line: 3, url: 'anything.js', func: 'foo', args: [] },
          { context: ['x'], column: 1, line: 2, url: 'anything.js', func: 'bar', args: [] },
        ];

        // Should remove `captureMessage` as its a name considered "internal"
        const frames = prepareFramesForEvent(stack);

        expect(frames.length).equal(2);
        expect(frames[0].function).equal('bar');
        expect(frames[1].function).equal('foo');
      });
    });

    describe('removed bottom frame if its internally reserved word (internal API)', async () => {
      it('reserved sentryWrapped', () => {
        const stack = [
          { context: ['x'], column: 1, line: 3, url: 'anything.js', func: 'foo', args: [] },
          { context: ['x'], column: 1, line: 2, url: 'anything.js', func: 'bar', args: [] },
          { context: ['x'], column: 1, line: 1, url: 'anything.js', func: 'sentryWrapped', args: [] },
        ];

        // Should remove `sentryWrapped` as its a name considered "internal"
        const frames = prepareFramesForEvent(stack);

        expect(frames.length).equal(2);
        expect(frames[0].function).equal('bar');
        expect(frames[1].function).equal('foo');
      });
    });

    it('removed top and bottom frame if they are internally reserved words', async () => {
      const stack = [
        { context: ['x'], column: 1, line: 4, url: 'anything.js', func: 'captureMessage', args: [] },
        { context: ['x'], column: 1, line: 3, url: 'anything.js', func: 'foo', args: [] },
        { context: ['x'], column: 1, line: 2, url: 'anything.js', func: 'bar', args: [] },
        { context: ['x'], column: 1, line: 1, url: 'anything.js', func: 'sentryWrapped', args: [] },
      ];

      // Should remove `captureMessage` and `sentryWrapped` as its a name considered "internal"
      const frames = prepareFramesForEvent(stack);

      expect(frames.length).equal(2);
      expect(frames[0].function).equal('bar');
      expect(frames[1].function).equal('foo');
    });
  });
});
