import { Scrubber } from '../src/scrubber';

/** JSDoc */
function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

let scrubber: Scrubber;
const sanitizeMask = '********';
const messageEvent = {
  fingerprint: ['MrSnuffles'],
  message: 'PickleRick',
  stacktrace: {
    frames: [
      {
        colno: 1,
        filename: 'filename.js',
        function: 'function',
        lineno: 1,
      },
      {
        colno: 2,
        filename: 'filename.js',
        function: 'function',
        lineno: 2,
      },
    ],
  },
};

describe('Scrubber', () => {
  describe('sanitizeKeys option is empty', () => {
    beforeEach(() => {
      scrubber = new Scrubber({
        sanitizeKeys: [],
      });
    });

    it('should not affect any changes', () => {
      const event = clone(messageEvent);
      const processedEvent = scrubber.process(event);
      expect(processedEvent).toEqual(event);
    });
  });

  describe('sanitizeKeys option has type of string', () => {
    beforeEach(() => {
      scrubber = new Scrubber({
        sanitizeKeys: ['message', 'filename'],
      });
    });

    it('should mask matched value in object', () => {
      const event = scrubber.process(clone(messageEvent));
      expect(event.message).toEqual(sanitizeMask);
    });

    it('should not mask unmatched value in object', () => {
      const event = scrubber.process(clone(messageEvent));
      expect(event.fingerprint).toEqual(messageEvent.fingerprint);
    });

    it('should mask matched value in Array', () => {
      const event: any = scrubber.process(clone(messageEvent));
      expect(event.stacktrace.frames[0].filename).toEqual(sanitizeMask);
      expect(event.stacktrace.frames[1].filename).toEqual(sanitizeMask);
    });

    it('should not mask unmatched value in Array', () => {
      const event: any = scrubber.process(clone(messageEvent));
      expect(event.stacktrace.frames[0].function).toEqual(messageEvent.stacktrace.frames[0].function);
      expect(event.stacktrace.frames[1].function).toEqual(messageEvent.stacktrace.frames[1].function);
    });
  });

  describe('sanitizeKeys option has type of RegExp', () => {
    beforeEach(() => {
      scrubber = new Scrubber({
        sanitizeKeys: [/^name$/],
      });
    });

    it('should mask only matched value', () => {
      const testEvent: any = {
        filename: 'to be show',
        name: 'do not show',
      };
      const event: any = scrubber.process(testEvent);
      expect(event.filename).toEqual(testEvent.filename);
      expect(event.name).toEqual(sanitizeMask);
    });
  });

  describe('sanitizeKeys option has mixed type of RegExp and string', () => {
    beforeEach(() => {
      scrubber = new Scrubber({
        sanitizeKeys: [/^filename$/, 'function'],
      });
    });

    it('should mask only matched value', () => {
      const event: any = scrubber.process(clone(messageEvent));
      expect(event.stacktrace.frames[0].function).toEqual(sanitizeMask);
      expect(event.stacktrace.frames[1].function).toEqual(sanitizeMask);
      expect(event.stacktrace.frames[0].filename).toEqual(sanitizeMask);
      expect(event.stacktrace.frames[1].filename).toEqual(sanitizeMask);
    });

    it('should not mask unmatched value', () => {
      const event: any = scrubber.process(clone(messageEvent));
      expect(event.stacktrace.frames[0].colno).toEqual(messageEvent.stacktrace.frames[0].colno);
      expect(event.stacktrace.frames[1].colno).toEqual(messageEvent.stacktrace.frames[1].colno);
      expect(event.stacktrace.frames[0].lineno).toEqual(messageEvent.stacktrace.frames[0].lineno);
      expect(event.stacktrace.frames[1].lineno).toEqual(messageEvent.stacktrace.frames[1].lineno);
    });
  });

  describe('event has circular objects', () => {
    beforeEach(() => {
      scrubber = new Scrubber({
        sanitizeKeys: [/message/],
      });
    });

    it('should not show call stack size exceeded', () => {
      const event: any = {
        contexts: {},
        extra: {
          message: 'do not show',
        },
      };
      event.contexts.circular = event.contexts;

      const actual = scrubber.process(event);
      expect(actual).toEqual({
        contexts: { circular: '[Circular ~]' },
        extra: { message: sanitizeMask },
      });
    });
  });
});
