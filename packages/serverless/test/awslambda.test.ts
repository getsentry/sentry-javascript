import { Event } from '@sentry/types';
// NOTE: I have no idea how to fix this right now, and don't want to waste more time, as it builds just fine — Kamil
// eslint-disable-next-line import/no-unresolved
import { Callback, Handler } from 'aws-lambda';

import * as Sentry from '../src';

const { wrapHandler } = Sentry.AWSLambda;

/**
 * Why @ts-ignore some Sentry.X calls
 *
 * A hack-ish way to contain everything related to mocks in the same __mocks__ file.
 * Thanks to this, we don't have to do more magic than necessary. Just add and export desired method and assert on it.
 */

// Default `timeoutWarningLimit` is 500ms so leaving some space for it to trigger when necessary
const DEFAULT_EXECUTION_TIME = 100;
const fakeEvent = {
  fortySix: 'o_O',
};
const fakeContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'functionName',
  functionVersion: 'functionVersion',
  invokedFunctionArn: 'invokedFunctionArn',
  memoryLimitInMB: 'memoryLimitInMB',
  awsRequestId: 'awsRequestId',
  logGroupName: 'logGroupName',
  logStreamName: 'logStreamName',
  getRemainingTimeInMillis: () => DEFAULT_EXECUTION_TIME,
  done: () => {},
  fail: () => {},
  succeed: () => {},
  ytho: 'o_O',
};
const fakeCallback: Callback = (err, result) => {
  if (err === null || err === undefined) {
    return result;
  }
  return err;
};

describe('AWSLambda', () => {
  afterEach(() => {
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.resetMocks();
  });

  describe('wrapHandler() options', () => {
    test('flushTimeout', async () => {
      expect.assertions(1);

      const error = new Error('wat');
      const handler = () => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337 });

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        expect(Sentry.flush).toBeCalledWith(1337);
      }
    });

    test('rethrowAfterCapture', async () => {
      expect.assertions(3);

      const error = new Error('wat');
      const handler = () => {
        throw error;
      };
      const wrappedHandlerWithRethrow = wrapHandler(handler, { rethrowAfterCapture: true });
      const wrappedHandlerWithoutRethrow = wrapHandler(handler, { rethrowAfterCapture: false });

      await expect(wrappedHandlerWithRethrow(fakeEvent, fakeContext, fakeCallback)).rejects.toThrow(error);
      await expect(wrappedHandlerWithoutRethrow(fakeEvent, fakeContext, fakeCallback)).resolves.not.toThrow();
      expect(Sentry.flush).toBeCalledTimes(2);
    });

    test('captureTimeoutWarning enabled (default)', async () => {
      expect.assertions(2);

      const handler: Handler = (_event, _context, callback) => {
        setTimeout(() => {
          callback(null, 42);
        }, DEFAULT_EXECUTION_TIME);
      };
      const wrappedHandler = wrapHandler(handler);
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(Sentry.captureMessage).toBeCalled();
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeScope.setTag).toBeCalledWith('timeout', '1s');
    });

    test('captureTimeoutWarning disabled', async () => {
      expect.assertions(2);

      const handler: Handler = (_event, _context, callback) => {
        setTimeout(() => {
          callback(null, 42);
        }, DEFAULT_EXECUTION_TIME);
      };
      const wrappedHandler = wrapHandler(handler, {
        captureTimeoutWarning: false,
      });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(Sentry.withScope).not.toBeCalled();
      expect(Sentry.captureMessage).not.toBeCalled();
    });

    test('captureTimeoutWarning with configured timeoutWarningLimit', async () => {
      /**
       * This extra long `getRemainingTimeInMillis` is enough to prove that `timeoutWarningLimit` is working
       * as warning delay is internally implemented as `context.getRemainingTimeInMillis() - options.timeoutWarningLimit`.
       * If it would not work as expected, we'd exceed `setTimeout` used and never capture the warning.
       */

      expect.assertions(2);

      const handler: Handler = (_event, _context, callback) => {
        setTimeout(() => {
          callback(null, 42);
        }, DEFAULT_EXECUTION_TIME);
      };
      const wrappedHandler = wrapHandler(handler, {
        timeoutWarningLimit: 99950, // 99.95s (which triggers warning after 50ms of our configured 100s below)
      });
      await wrappedHandler(
        fakeEvent,
        {
          ...fakeContext,
          getRemainingTimeInMillis: () => 100000, // 100s - using such a high value to test human-readable format in one of the assertions
        },
        fakeCallback,
      );

      expect(Sentry.captureMessage).toBeCalled();
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeScope.setTag).toBeCalledWith('timeout', '1m40s');
    });
  });

  describe('wrapHandler() on sync handler', () => {
    test('successful execution', async () => {
      expect.assertions(1);

      const handler: Handler = (_event, _context, callback) => {
        callback(null, 42);
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(rv).toStrictEqual(42);
    });

    test('unsuccessful execution', async () => {
      expect.assertions(2);

      const error = new Error('sorry');
      const handler: Handler = (_event, _context, callback) => {
        callback(error);
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        expect(Sentry.captureException).toBeCalledWith(error);
        expect(Sentry.flush).toBeCalledWith(2000);
      }
    });

    test('event and context are correctly passed along', async () => {
      expect.assertions(2);

      const handler: Handler = (event, context, callback) => {
        expect(event).toHaveProperty('fortySix');
        expect(context).toHaveProperty('ytho');
        callback(undefined, { its: 'fine' });
      };
      const wrappedHandler = wrapHandler(handler);
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
    });

    test('capture error', async () => {
      expect.assertions(2);

      const error = new Error('wat');
      const handler: Handler = (_event, _context, _callback) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        expect(Sentry.captureException).toBeCalled();
        expect(Sentry.flush).toBeCalled();
      }
    });
  });

  describe('wrapHandler() on async handler', () => {
    test('successful execution', async () => {
      expect.assertions(1);

      const handler: Handler = async (_event, _context) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(rv).toStrictEqual(42);
    });

    test('event and context are correctly passed to the original handler', async () => {
      expect.assertions(2);

      const handler: Handler = async (event, context) => {
        expect(event).toHaveProperty('fortySix');
        expect(context).toHaveProperty('ytho');
      };
      const wrappedHandler = wrapHandler(handler);
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
    });

    test('capture error', async () => {
      expect.assertions(2);

      const error = new Error('wat');
      const handler: Handler = async (_event, _context) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        expect(Sentry.captureException).toBeCalled();
        expect(Sentry.flush).toBeCalled();
      }
    });
  });

  describe('wrapHandler() on async handler with a callback method (aka incorrect usage)', () => {
    test('successful execution', async () => {
      expect.assertions(1);

      const handler: Handler = async (_event, _context, _callback) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(rv).toStrictEqual(42);
    });

    test('event and context are correctly passed to the original handler', async () => {
      expect.assertions(2);

      const handler: Handler = async (event, context, _callback) => {
        expect(event).toHaveProperty('fortySix');
        expect(context).toHaveProperty('ytho');
      };
      const wrappedHandler = wrapHandler(handler);
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
    });

    test('capture error', async () => {
      expect.assertions(2);

      const error = new Error('wat');
      const handler: Handler = async (_event, _context, _callback) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        expect(Sentry.captureException).toBeCalled();
        expect(Sentry.flush).toBeCalled();
      }
    });
  });

  test('enhance event with SDK info and correct mechanism value', async () => {
    expect.assertions(2);

    const error = new Error('wat');
    const handler = () => {
      throw error;
    };
    const wrappedHandler = wrapHandler(handler, { rethrowAfterCapture: false });

    const eventWithSomeData = {
      exception: {
        values: [{}],
      },
      sdk: {
        integrations: ['SomeIntegration'],
        packages: [
          {
            name: 'some:@random/package',
            version: '1337',
          },
        ],
      },
    };
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.fakeScope.addEventProcessor.mockImplementationOnce(cb => cb(eventWithSomeData));
    await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
    expect(eventWithSomeData).toEqual({
      exception: {
        values: [
          {
            mechanism: {
              handled: false,
            },
          },
        ],
      },
      sdk: {
        name: 'sentry.javascript.serverless',
        integrations: ['SomeIntegration', 'AWSLambda'],
        packages: [
          {
            name: 'some:@random/package',
            version: '1337',
          },
          {
            name: 'npm:@sentry/serverless',
            version: '6.6.6',
          },
        ],
        version: '6.6.6',
      },
    });

    const eventWithoutAnyData: Event = {
      exception: {
        values: [{}],
      },
    };
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.fakeScope.addEventProcessor.mockImplementationOnce(cb => cb(eventWithoutAnyData));
    await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
    expect(eventWithoutAnyData).toEqual({
      exception: {
        values: [
          {
            mechanism: {
              handled: false,
            },
          },
        ],
      },
      sdk: {
        name: 'sentry.javascript.serverless',
        integrations: ['AWSLambda'],
        packages: [
          {
            name: 'npm:@sentry/serverless',
            version: '6.6.6',
          },
        ],
        version: '6.6.6',
      },
    });
  });
});
