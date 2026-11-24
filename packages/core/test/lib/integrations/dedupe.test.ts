import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  getCurrentScope,
  linkedErrorsIntegration,
  makeSession,
  setCurrentClient,
  withScope,
} from '../../../src';
import { _shouldDropEvent, dedupeIntegration } from '../../../src/integrations/dedupe';
import type { Event as SentryEvent } from '../../../src/types/event';
import type { Exception } from '../../../src/types/exception';
import type { StackFrame } from '../../../src/types/stackframe';
import type { Stacktrace } from '../../../src/types/stacktrace';
import { getDefaultTestClientOptions, TestClient, type TestClientOptions } from '../../mocks/client';
import { AsyncTestIntegration } from '../../mocks/integration';
import { resetGlobals } from '../../testutils';

const PUBLIC_DSN = 'https://username@domain/123';

type EventWithException = SentryEvent & {
  exception: {
    values: ExceptionWithStacktrace[];
  };
};
type ExceptionWithStacktrace = Exception & { stacktrace: StacktraceWithFrames };
type StacktraceWithFrames = Stacktrace & { frames: StackFrame[] };

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

const messageEvent: EventWithException = {
  fingerprint: ['MrSnuffles'],
  message: 'PickleRick',
  exception: {
    values: [
      {
        value: 'PickleRick',
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
      },
    ],
  },
};
const exceptionEvent: EventWithException = {
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
      expect(_shouldDropEvent(event)).toBe(false);
    });

    it('should not drop if events have different messages', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      eventB.message = 'EvilMorty';
      eventB.exception.values[0]!.value = 'EvilMorty';
      expect(_shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should not drop if events have same messages, but different stacktraces', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      eventB.exception.values[0]!.stacktrace.frames[0]!.colno = 1337;
      expect(_shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should drop if there are two events with same messages and no fingerprints', () => {
      const eventA = clone(messageEvent);
      delete eventA.fingerprint;
      const eventB = clone(messageEvent);
      delete eventB.fingerprint;
      expect(_shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should drop if there are two events with same messages and same fingerprints', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      expect(_shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should not drop if there are two events with same message but different fingerprints', () => {
      const eventA = clone(messageEvent);
      const eventB = clone(messageEvent);
      eventA.fingerprint = ['Birdperson'];
      const eventC = clone(messageEvent);
      delete eventC.fingerprint;
      expect(_shouldDropEvent(eventA, eventB)).toBe(false);
      expect(_shouldDropEvent(eventA, eventC)).toBe(false);
      expect(_shouldDropEvent(eventB, eventC)).toBe(false);
    });
  });

  describe('shouldDropEvent(exceptionEvent)', () => {
    it('should not drop if there was no previous event', () => {
      const event = clone(exceptionEvent);
      expect(_shouldDropEvent(event)).toBe(false);
    });

    it('should drop when events type, value and stacktrace are the same', () => {
      const event = clone(exceptionEvent);
      expect(_shouldDropEvent(event, event)).toBe(true);
    });

    it('should not drop if types are different', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventB.exception.values[0]!.type = 'TypeError';
      expect(_shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should not drop if values are different', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventB.exception.values[0]!.value = 'Expected number, got string';
      expect(_shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should not drop if stacktraces are different', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventB.exception.values[0]!.stacktrace.frames[0]!.colno = 1337;
      expect(_shouldDropEvent(eventA, eventB)).toBe(false);
    });

    it('should drop if there are two events with same exception and no fingerprints', () => {
      const eventA = clone(exceptionEvent);
      delete eventA.fingerprint;
      const eventB = clone(exceptionEvent);
      delete eventB.fingerprint;
      expect(_shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should drop if there are two events with same exception and same fingerprints', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      expect(_shouldDropEvent(eventA, eventB)).toBe(true);
    });

    it('should not drop if there are two events with same exception but different fingerprints', () => {
      const eventA = clone(exceptionEvent);
      const eventB = clone(exceptionEvent);
      eventA.fingerprint = ['Birdperson'];
      const eventC = clone(exceptionEvent);
      delete eventC.fingerprint;
      expect(_shouldDropEvent(eventA, eventB)).toBe(false);
      expect(_shouldDropEvent(eventA, eventC)).toBe(false);
      expect(_shouldDropEvent(eventB, eventC)).toBe(false);
    });
  });

  describe('integration', () => {
    beforeEach(() => {
      TestClient.instance = undefined;
      TestClient.sendEventCalled = undefined;
      resetGlobals();
    });

    function initClient(options: Partial<TestClientOptions> = {}): TestClient {
      const client = new TestClient(
        getDefaultTestClientOptions({ dsn: PUBLIC_DSN, integrations: [dedupeIntegration()], ...options }),
      );
      setCurrentClient(client);
      client.init();
      return client;
    }

    it('drops consecutive duplicate errors', () => {
      const sendEventCalled = vi.fn();
      TestClient.sendEventCalled = sendEventCalled;
      const client = initClient();

      client.captureException(new Error('duplicate'));
      client.captureException(new Error('duplicate'));
      client.captureException(new Error('duplicate'));

      expect(sendEventCalled).toHaveBeenCalledOnce();
      expect(client._clearOutcomes()).toEqual([{ reason: 'event_processor', category: 'error', quantity: 2 }]);
    });

    it('compares an event only with the previous event', () => {
      const sendEventCalled = vi.fn();
      TestClient.sendEventCalled = sendEventCalled;
      const client = initClient();

      for (const value of ['a', 'a', 'b', 'b', 'a']) {
        client.captureException(new Error(value));
      }
      client.captureMessage('message');
      client.captureMessage('message');

      expect(sendEventCalled).toHaveBeenCalledTimes(4);
      expect(client._clearOutcomes()).toEqual([{ reason: 'event_processor', category: 'error', quantity: 3 }]);
    });

    it('compares errors with the fingerprint from the scope', () => {
      const sendEventCalled = vi.fn();
      TestClient.sendEventCalled = sendEventCalled;
      const client = initClient();

      for (const fingerprint of ['a', 'b']) {
        withScope(scope => {
          scope.setFingerprint([fingerprint]);
          client.captureException(new Error('same error'), undefined, scope);
        });
      }

      expect(sendEventCalled).toHaveBeenCalledTimes(2);
    });

    it('compares errors with their linked errors', () => {
      const sendEventCalled = vi.fn();
      TestClient.sendEventCalled = sendEventCalled;
      initClient({ integrations: [linkedErrorsIntegration(), dedupeIntegration()] });

      for (const cause of ['a', 'a', 'b']) {
        captureException(Object.assign(new Error('same error'), { cause: new Error(cause) }));
      }

      expect(sendEventCalled).toHaveBeenCalledTimes(2);
    });

    it('does not let duplicate errors push other errors out of the promise buffer', async () => {
      const sendEventCalled = vi.fn();
      TestClient.sendEventCalled = sendEventCalled;
      const client = initClient({
        integrations: [dedupeIntegration(), new AsyncTestIntegration()],
        transportOptions: { bufferSize: 2 },
      });
      getCurrentScope().setSession(makeSession());

      for (let i = 0; i < 10; i++) {
        client.captureException(new Error('duplicate'));
      }
      client.captureException(new Error('other error'));
      await client.flush();

      expect(sendEventCalled).toHaveBeenCalledTimes(2);
      expect(client._clearOutcomes()).toEqual([{ reason: 'event_processor', category: 'error', quantity: 9 }]);
    });

    it('updates the session for a duplicate error', () => {
      const client = initClient();
      const session = makeSession();
      getCurrentScope().setSession(session);

      client.captureException(new Error('duplicate'));
      client.captureException(new Error('duplicate'), { mechanism: { type: 'generic', handled: false } });

      expect(session.errors).toBe(1);
      expect(session.status).toBe('crashed');
      expect(client._clearOutcomes()).toEqual([{ reason: 'event_processor', category: 'error', quantity: 1 }]);
    });

    it('does not count a duplicate error that a later event processor drops', () => {
      const client = initClient();
      const session = makeSession();
      getCurrentScope().setSession(session);
      client.addEventProcessor(() => null);

      client.captureException(new Error('duplicate'));
      client.captureException(new Error('duplicate'));

      expect(session.errors).toBe(0);
      expect(client._clearOutcomes()).toEqual([{ reason: 'event_processor', category: 'error', quantity: 2 }]);
    });

    it('drops a handled duplicate error from the same isolation scope without calling `beforeSend` again', () => {
      const beforeSend = vi.fn(() => null);
      const client = initClient({ beforeSend });
      const session = makeSession();
      getCurrentScope().setSession(session);

      client.captureException(new Error('duplicate'));
      client.captureException(new Error('duplicate'));
      client.captureException(new Error('duplicate'));

      expect(beforeSend).toHaveBeenCalledOnce();
      expect(session.errors).toBe(0);
      expect(client._clearOutcomes()).toEqual([
        { reason: 'before_send', category: 'error', quantity: 1 },
        { reason: 'event_processor', category: 'error', quantity: 2 },
      ]);
    });

    it('updates the session for a duplicate error when Dedupe runs after an asynchronous event processor', async () => {
      const sendEventCalled = vi.fn();
      TestClient.sendEventCalled = sendEventCalled;
      const client = initClient({ integrations: [new AsyncTestIntegration(), dedupeIntegration()] });
      const session = makeSession();
      getCurrentScope().setSession(session);

      client.captureException(new Error('duplicate'));
      client.captureException(new Error('duplicate'), { mechanism: { type: 'generic', handled: false } });
      await client.flush();

      expect(sendEventCalled).toHaveBeenCalledOnce();
      expect(session.status).toBe('crashed');
      expect(client._clearOutcomes()).toEqual([{ reason: 'event_processor', category: 'error', quantity: 1 }]);
    });

    it('does not drop a sampled-in error that duplicates a sampled-out error', () => {
      const sendEventCalled = vi.fn();
      TestClient.sendEventCalled = sendEventCalled;
      const client = initClient({ sampleRate: 0 });
      getCurrentScope().setSession(makeSession());

      client.captureException(new Error('duplicate'));
      client.getOptions().sampleRate = 1;
      client.captureException(new Error('duplicate'));

      expect(sendEventCalled).toHaveBeenCalledOnce();
    });
  });
});
