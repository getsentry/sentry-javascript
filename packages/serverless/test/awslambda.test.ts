// NOTE: I have no idea how to fix this right now, and don't want to waste more time, as it builds just fine — Kamil
import * as SentryNode from '@sentry/node';
import type { Event } from '@sentry/types';
import type { Callback, Handler } from 'aws-lambda';

import * as Sentry from '../src';

const { wrapHandler } = Sentry.AWSLambda;

/**
 * Why @ts-expect-error some Sentry.X calls
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
  // @ts-expect-error see "Why @ts-expect-error" note
  const fakeTransaction = { ...SentryNode.fakeTransaction, ...fakeTransactionContext };
  // @ts-expect-error see "Why @ts-expect-error" note
  expect(SentryNode.fakeScope.setTransactionName).toHaveBeenCalledWith('functionName');
  // @ts-expect-error see "Why @ts-expect-error" note
  expect(SentryNode.fakeScope.setSpan).toHaveBeenCalledWith(fakeTransaction);
  // @ts-expect-error see "Why @ts-expect-error" note
  expect(SentryNode.fakeScope.setTag).toHaveBeenCalledWith('server_name', expect.anything());
  // @ts-expect-error see "Why @ts-expect-error" note
  expect(SentryNode.fakeScope.setTag).toHaveBeenCalledWith('url', 'awslambda:///functionName');
  // @ts-expect-error see "Why @ts-expect-error" note
  expect(SentryNode.fakeScope.setContext).toHaveBeenCalledWith(
    'aws.lambda',
    expect.objectContaining({
      aws_request_id: 'awsRequestId',
      function_name: 'functionName',
      function_version: 'functionVersion',
      invoked_function_arn: 'invokedFunctionArn',
      remaining_time_in_millis: 100,
    }),
  );
  // @ts-expect-error see "Why @ts-expect-error" note
  expect(SentryNode.fakeScope.setContext).toHaveBeenCalledWith(
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
    // @ts-expect-error see "Why @ts-expect-error" note
    SentryNode.resetMocks();
  });

  describe('wrapHandler() options', () => {
    test('flushTimeout', async () => {
      expect.assertions(1);

      const handler = () => {};
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337 });

      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(SentryNode.flush).toHaveBeenCalledWith(1337);
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

      expect(Sentry.captureMessage).toHaveBeenCalled();
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeScope.setTag).toHaveBeenCalledWith('timeout', '1s');
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

      expect(Sentry.withScope).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
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

      expect(Sentry.captureMessage).toHaveBeenCalled();
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeScope.setTag).toHaveBeenCalledWith('timeout', '1m40s');
    });

    test('captureAllSettledReasons disabled (default)', async () => {
      const handler = () => Promise.resolve([{ status: 'rejected', reason: new Error() }]);
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337 });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(SentryNode.captureException).toHaveBeenCalledTimes(0);
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
      expect(SentryNode.captureException).toHaveBeenNthCalledWith(1, error, expect.any(Function));
      expect(SentryNode.captureException).toHaveBeenNthCalledWith(2, error2, expect.any(Function));
      expect(SentryNode.captureException).toHaveBeenCalledTimes(2);
    });

    // "wrapHandler() ... successful execution" tests the default of startTrace enabled
    test('startTrace disabled', async () => {
      expect.assertions(3);

      const handler: Handler = async (_event, _context) => 42;
      const wrappedHandler = wrapHandler(handler, { startTrace: false });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeScope.setTransactionName).toHaveBeenCalledTimes(0);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeScope.setTag).toHaveBeenCalledTimes(0);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledTimes(0);
    });
  });

  describe('wrapHandler() on sync handler', () => {
    test('successful execution', async () => {
      expect.assertions(10);

      const handler: Handler = (_event, _context, callback) => {
        callback(null, 42);
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      const fakeTransactionContext = {
        name: 'functionName',
        op: 'function.aws.lambda',
        origin: 'auto.function.serverless',
        metadata: { source: 'component' },
      };

      expect(rv).toStrictEqual(42);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(fakeTransactionContext);
      expectScopeSettings(fakeTransactionContext);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeTransaction.finish).toHaveBeenCalled();
      expect(SentryNode.flush).toHaveBeenCalledWith(2000);
    });

    test('unsuccessful execution', async () => {
      expect.assertions(10);

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
          origin: 'auto.function.serverless',
          metadata: { source: 'component' },
        };

        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(SentryNode.captureException).toHaveBeenCalledWith(error, expect.any(Function));
        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeTransaction.finish).toHaveBeenCalled();
        expect(SentryNode.flush).toHaveBeenCalledWith(2000);
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
        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            parentSpanId: '1121201211212012',
            parentSampled: false,
            op: 'function.aws.lambda',
            origin: 'auto.function.serverless',
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
      expect.assertions(10);

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
          origin: 'auto.function.serverless',
          traceId: '12312012123120121231201212312012',
          parentSpanId: '1121201211212012',
          parentSampled: false,
          metadata: { dynamicSamplingContext: {}, source: 'component' },
        };

        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(SentryNode.captureException).toHaveBeenCalledWith(e, expect.any(Function));
        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeTransaction.finish).toHaveBeenCalled();
        expect(SentryNode.flush).toHaveBeenCalled();
      }
    });
  });

  describe('wrapHandler() on async handler', () => {
    test('successful execution', async () => {
      expect.assertions(10);

      const handler: Handler = async (_event, _context) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      const fakeTransactionContext = {
        name: 'functionName',
        op: 'function.aws.lambda',
        origin: 'auto.function.serverless',
        metadata: { source: 'component' },
      };

      expect(rv).toStrictEqual(42);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(fakeTransactionContext);
      expectScopeSettings(fakeTransactionContext);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeTransaction.finish).toHaveBeenCalled();
      expect(SentryNode.flush).toHaveBeenCalled();
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
      expect.assertions(10);

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
          origin: 'auto.function.serverless',
          metadata: { source: 'component' },
        };

        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(SentryNode.captureException).toHaveBeenCalledWith(error, expect.any(Function));
        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeTransaction.finish).toHaveBeenCalled();
        expect(SentryNode.flush).toHaveBeenCalled();
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
      expect.assertions(10);

      const handler: Handler = async (_event, _context, _callback) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      const fakeTransactionContext = {
        name: 'functionName',
        op: 'function.aws.lambda',
        origin: 'auto.function.serverless',
        metadata: { source: 'component' },
      };

      expect(rv).toStrictEqual(42);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(fakeTransactionContext);
      expectScopeSettings(fakeTransactionContext);
      // @ts-expect-error see "Why @ts-expect-error" note
      expect(SentryNode.fakeTransaction.finish).toHaveBeenCalled();
      expect(SentryNode.flush).toHaveBeenCalled();
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
      expect.assertions(10);

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
          origin: 'auto.function.serverless',
          metadata: { source: 'component' },
        };

        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeHub.startTransaction).toHaveBeenCalledWith(fakeTransactionContext);
        expectScopeSettings(fakeTransactionContext);
        expect(SentryNode.captureException).toHaveBeenCalledWith(error, expect.any(Function));
        // @ts-expect-error see "Why @ts-expect-error" note
        expect(SentryNode.fakeTransaction.finish).toHaveBeenCalled();
        expect(SentryNode.flush).toHaveBeenCalled();
      }
    });
  });

  test('marks the captured error as unhandled', async () => {
    expect.assertions(3);

    const error = new Error('wat');
    const handler: Handler = async (_event, _context, _callback) => {
      throw error;
    };
    const wrappedHandler = wrapHandler(handler);

    try {
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
    } catch (e) {
      expect(SentryNode.captureException).toHaveBeenCalledWith(error, expect.any(Function));
      // @ts-expect-error see "Why @ts-expect-error" note
      const scopeFunction = SentryNode.captureException.mock.calls[0][1];
      const event: Event = { exception: { values: [{}] } };
      let evtProcessor: ((e: Event) => Event) | undefined = undefined;
      scopeFunction({ addEventProcessor: jest.fn().mockImplementation(proc => (evtProcessor = proc)) });

      expect(evtProcessor).toBeInstanceOf(Function);
      // @ts-expect-error just mocking around...
      expect(evtProcessor(event).exception.values[0].mechanism).toEqual({
        handled: false,
        type: 'generic',
      });
    }
  });

  describe('init()', () => {
    test('calls Sentry.init with correct sdk info metadata', () => {
      Sentry.AWSLambda.init({});

      expect(Sentry.init).toHaveBeenCalledWith(
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
  });
});
