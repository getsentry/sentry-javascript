import { Dedupe } from '../src/dedupe';

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

const dedupe = new Dedupe();
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
const exceptionEvent = {
  exception: {
    values: [
      {
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
        type: 'SyntaxError',
        value: 'missing ( on line 10',
      },
    ],
  },
  fingerprint: ['MrSnuffles'],
};

describe('Dedupe', () => {
  describe('shouldDropEvent(messageEvent)', () => {
    it('should not drop if there was no previous event', () => {
      const event = clone(messageEvent);
      expect((dedupe as any)._shouldDropEvent(event)).toBe(false);
    });

    it('should not drop if events have different messages', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      eventB.message = 'EvilMorty';
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should not drop if events have same messages, but different stacktraces', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      eventB.stacktrace.frames[0].colno = 1337;
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should drop if there are two events with same messages and no fingerprints', () => {
      const eventA = clone(messageEvent);
      delete eventA.fingerprint;
      const eventB = clone(messageEvent);
      delete eventB.fingerprint;
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should drop if there are two events with same messages and same fingerprints', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should not drop if there are two events with same message but different fingerprints', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      eventA.fingerprint = ['Birdperson'];
      const eventC = clone(messageEvent);
      delete eventC.fingerprint;
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(false);
      expect((dedupe as any)._shouldDropEvent(eventA, eventC)).toBe(false);
      expect((dedupe as any)._shouldDropEvent(eventB, eventC)).toBe(false);
    });
  });

  describe('shouldDropEvent(exceptionEvent)', () => {
    it('should not drop if there was no previous event', () => {
      const event = clone(exceptionEvent);
      expect((dedupe as any)._shouldDropEvent(event)).toBe(false);
    });

    it('should drop when events type, value and stacktrace are the same', () => {
      const event = clone(exceptionEvent);
      expect((dedupe as any)._shouldDropEvent(event, event)).toBe(true);
    });

    it('should not drop if types are different', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventB.exception.values[0].type = 'TypeError';
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should not drop if values are different', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventB.exception.values[0].value = 'Expected number, got string';
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should not drop if stacktraces are different', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventB.exception.values[0].stacktrace.frames[0].colno = 1337;
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should drop if there are two events with same exception and no fingerprints', () => {
      const eventA = clone(exceptionEvent);
      delete eventA.fingerprint;
      const eventB = clone(exceptionEvent);
      delete eventB.fingerprint;
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should drop if there are two events with same exception and same fingerprints', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should not drop if there are two events with same exception but different fingerprints', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventA.fingerprint = ['Birdperson'];
      const eventC = clone(exceptionEvent);
      delete eventC.fingerprint;
      expect((dedupe as any)._shouldDropEvent(eventA, eventB)).toBe(false);
      expect((dedupe as any)._shouldDropEvent(eventA, eventC)).toBe(false);
      expect((dedupe as any)._shouldDropEvent(eventB, eventC)).toBe(false);
    });
  });
});
