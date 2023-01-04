// NOTE: I have no idea how to fix this right now, and don't want to waste more time, as it builds just fine — Kamil
// eslint-disable-next-line import/no-unresolved
import type { Callback, Handler } from 'aws-lambda';

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
let fakeEvent: { [key: string]: unknown };
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

function expectScopeSettings(fakeTransactionContext: any) {
  // @ts-ignore see "Why @ts-ignore" note
  const fakeTransaction = { ...Sentry.fakeTransaction, ...fakeTransactionContext };
  // @ts-ignore see "Why @ts-ignore" note
  expect(Sentry.fakeScope.setSpan).toBeCalledWith(fakeTransaction);
  // @ts-ignore see "Why @ts-ignore" note
  expect(Sentry.fakeScope.setTag).toBeCalledWith('server_name', expect.anything());
  // @ts-ignore see "Why @ts-ignore" note
  expect(Sentry.fakeScope.setTag).toBeCalledWith('url', 'awslambda:///functionName');
  // @ts-ignore see "Why @ts-ignore" note
  expect(Sentry.fakeScope.setContext).toBeCalledWith(
    'aws.lambda',
    expect.objectContaining({
      aws_request_id: 'awsRequestId',
      function_name: 'functionName',
      function_version: 'functionVersion',
      invoked_function_arn: 'invokedFunctionArn',
      remaining_time_in_millis: 100,
    }),
  );
  // @ts-ignore see "Why @ts-ignore" note
  expect(Sentry.fakeScope.setContext).toBeCalledWith(
    'aws.cloudwatch.logs',
    expect.objectContaining({
      log_group: 'logGroupName',
      log_stream: 'logStreamName',
    }),
  );
}

describe('AWSLambda', () => {
  beforeEach(() => {
    fakeEvent = {
      fortySix: 'o_O',
    };
  });

  afterEach(() => {
    // @ts-ignore see "Why @ts-ignore" note
    Sentry.resetMocks();
  });

  describe('wrapHandler() options', () => {
    test('flushTimeout', async () => {
      expect.assertions(1);

      const handler = () => {};
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337 });

      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(Sentry.flush).toBeCalledWith(1337);
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

    test('captureAllSettledReasons disabled (default)', async () => {
      const handler = () => Promise.resolve([{ status: 'rejected', reason: new Error() }]);
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337 });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(Sentry.captureException).toBeCalledTimes(0);
    });

    test('captureAllSettledReasons enable', async () => {
      const error = new Error();
      const error2 = new Error();
      const handler = () =>
        Promise.resolve([
          { status: 'rejected', reason: error },
          { status: 'fulfilled', value: undefined },
          { status: 'rejected', reason: error2 },
        ]);
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337, captureAllSettledReasons: true });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(Sentry.captureException).toHaveBeenNthCalledWith(1, error);
      expect(Sentry.captureException).toHaveBeenNthCalledWith(2, error2);
      expect(Sentry.captureException).toBeCalledTimes(2);
    });
  });

  describe('wrapHandler() on sync handler', () => {
    test('successful execution', async () => {
      expect.assertions(9);

      const handler: Handler = (_event, _context, callback) => {
        callback(null, 42);
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      const fakeTransactionContext = {
        name: 'functionName',
        op: 'function.aws.lambda',
        metadata: { source: 'component' },
      };

      expect(rv).toStrictEqual(42);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeHub.startTransaction).toBeCalledWith(fakeTransactionContext);
      expectScopeSettings(fakeTransactionContext);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalledWith(2000);
    });

    test('unsuccessful execution', async () => {
      expect.assertions(9);

      const error = new Error('sorry');
      const handler: Handler = (_event, _context, callback) => {
        callback(error);
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        const fakeTransactionContext = {
          name: 'functionName',
          op: 'function.aws.lambda',
          metadata: { source: 'component' },
        };

        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeHub.startTransaction).toBeCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(Sentry.captureException).toBeCalledWith(error);
        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeTransaction.finish).toBeCalled();
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

    test('incoming trace headers are correctly parsed and used', async () => {
      expect.assertions(1);

      fakeEvent.headers = {
        'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
        baggage: 'sentry-release=2.12.1,maisey=silly,charlie=goofy',
      };

      const handler: Handler = (_event, _context, callback) => {
        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeHub.startTransaction).toBeCalledWith(
          expect.objectContaining({
            parentSpanId: '1121201211212012',
            parentSampled: false,
            op: 'function.aws.lambda',
            name: 'functionName',
            traceId: '12312012123120121231201212312012',
            metadata: {
              dynamicSamplingContext: {
                release: '2.12.1',
              },
              source: 'component',
            },
          }),
        );

        callback(undefined, { its: 'fine' });
      };

      const wrappedHandler = wrapHandler(handler);
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
    });

    test('capture error', async () => {
      expect.assertions(9);

      const error = new Error('wat');
      const handler: Handler = (_event, _context, _callback) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        fakeEvent.headers = { 'sentry-trace': '12312012123120121231201212312012-1121201211212012-0' };
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        const fakeTransactionContext = {
          name: 'functionName',
          op: 'function.aws.lambda',
          traceId: '12312012123120121231201212312012',
          parentSpanId: '1121201211212012',
          parentSampled: false,
          metadata: { dynamicSamplingContext: {}, source: 'component' },
        };

        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeHub.startTransaction).toBeCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(Sentry.captureException).toBeCalledWith(e);
        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeTransaction.finish).toBeCalled();
        expect(Sentry.flush).toBeCalled();
      }
    });
  });

  describe('wrapHandler() on async handler', () => {
    test('successful execution', async () => {
      expect.assertions(9);

      const handler: Handler = async (_event, _context) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      const fakeTransactionContext = {
        name: 'functionName',
        op: 'function.aws.lambda',
        metadata: { source: 'component' },
      };

      expect(rv).toStrictEqual(42);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeHub.startTransaction).toBeCalledWith(fakeTransactionContext);
      expectScopeSettings(fakeTransactionContext);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
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
      expect.assertions(9);

      const error = new Error('wat');
      const handler: Handler = async (_event, _context) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        const fakeTransactionContext = {
          name: 'functionName',
          op: 'function.aws.lambda',
          metadata: { source: 'component' },
        };

        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeHub.startTransaction).toBeCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(Sentry.captureException).toBeCalledWith(error);
        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeTransaction.finish).toBeCalled();
        expect(Sentry.flush).toBeCalled();
      }
    });

    test('should not throw when flush rejects', async () => {
      const handler: Handler = async () => {
        // Friendly handler with no errors :)
        return 'some string';
      };

      const wrappedHandler = wrapHandler(handler);

      jest.spyOn(Sentry, 'flush').mockImplementationOnce(async () => {
        throw new Error();
      });

      await expect(wrappedHandler(fakeEvent, fakeContext, fakeCallback)).resolves.toBe('some string');
    });
  });

  describe('wrapHandler() on async handler with a callback method (aka incorrect usage)', () => {
    test('successful execution', async () => {
      expect.assertions(9);

      const handler: Handler = async (_event, _context, _callback) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      const fakeTransactionContext = {
        name: 'functionName',
        op: 'function.aws.lambda',
        metadata: { source: 'component' },
      };

      expect(rv).toStrictEqual(42);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeHub.startTransaction).toBeCalledWith(fakeTransactionContext);
      expectScopeSettings(fakeTransactionContext);
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.finish).toBeCalled();
      expect(Sentry.flush).toBeCalled();
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
      expect.assertions(9);

      const error = new Error('wat');
      const handler: Handler = async (_event, _context, _callback) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        const fakeTransactionContext = {
          name: 'functionName',
          op: 'function.aws.lambda',
          metadata: { source: 'component' },
        };

        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeHub.startTransaction).toBeCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(Sentry.captureException).toBeCalledWith(error);
        // @ts-ignore see "Why @ts-ignore" note
        expect(Sentry.fakeTransaction.finish).toBeCalled();
        expect(Sentry.flush).toBeCalled();
      }
    });
  });

  describe('init()', () => {
    test('calls Sentry.init with correct sdk info metadata', () => {
      Sentry.AWSLambda.init({});

      expect(Sentry.init).toBeCalledWith(
        expect.objectContaining({
          _metadata: {
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
          },
        }),
      );
    });

    test('enhance event with correct mechanism value', () => {
      const eventWithSomeData = {
        exception: {
          values: [{}],
        },
      };

      // @ts-ignore see "Why @ts-ignore" note
      Sentry.addGlobalEventProcessor.mockImplementationOnce(cb => cb(eventWithSomeData));
      Sentry.AWSLambda.init({});

      expect(eventWithSomeData).toEqual({
        exception: {
          values: [
            {
              mechanism: {
                handled: false,
                type: 'generic',
              },
            },
          ],
        },
      });
    });
  });
});
