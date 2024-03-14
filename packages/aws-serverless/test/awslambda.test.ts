import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';

import type { Event } from '@sentry/types';
import type { Callback, Handler } from 'aws-lambda';

import { init, wrapHandler } from '../src/awslambda';

const mockSpanEnd = jest.fn();
const mockStartInactiveSpan = jest.fn((...spanArgs) => ({ ...spanArgs }));
const mockStartSpanManual = jest.fn((...spanArgs) => ({ ...spanArgs }));
const mockFlush = jest.fn((...args) => Promise.resolve(args));
const mockWithScope = jest.fn();
const mockCaptureMessage = jest.fn();
const mockCaptureException = jest.fn();
const mockInit = jest.fn();

const mockScope = {
  setTag: jest.fn(),
  setContext: jest.fn(),
  addEventProcessor: jest.fn(),
};

jest.mock('@sentry/node', () => {
  const original = jest.requireActual('@sentry/node');
  return {
    ...original,
    init: (options: unknown) => {
      mockInit(options);
    },
    startInactiveSpan: (...args: unknown[]) => {
      mockStartInactiveSpan(...args);
      return { end: mockSpanEnd };
    },
    startSpanManual: (...args: unknown[]) => {
      mockStartSpanManual(...args);
      mockSpanEnd();
      return original.startSpanManual(...args);
    },
    getCurrentScope: () => {
      return mockScope;
    },
    flush: (...args: unknown[]) => {
      return mockFlush(...args);
    },
    withScope: (fn: (scope: unknown) => void) => {
      mockWithScope(fn);
      fn(mockScope);
    },
    captureMessage: (...args: unknown[]) => {
      mockCaptureMessage(...args);
    },
    captureException: (...args: unknown[]) => {
      mockCaptureException(...args);
    },
  };
});

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

function expectScopeSettings() {
  expect(mockScope.addEventProcessor).toBeCalledTimes(1);
  // Test than an event processor to add `transaction` is registered for the scope
  const eventProcessor = mockScope.addEventProcessor.mock.calls[0][0];
  const event: Event = {};
  eventProcessor(event);
  expect(event).toEqual({ transaction: 'functionName' });

  expect(mockScope.setTag).toBeCalledWith('server_name', expect.anything());

  expect(mockScope.setTag).toBeCalledWith('url', 'awslambda:///functionName');

  expect(mockScope.setContext).toBeCalledWith(
    'aws.lambda',
    expect.objectContaining({
      aws_request_id: 'awsRequestId',
      function_name: 'functionName',
      function_version: 'functionVersion',
      invoked_function_arn: 'invokedFunctionArn',
      remaining_time_in_millis: 100,
    }),
  );

  expect(mockScope.setContext).toBeCalledWith(
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

    jest.clearAllMocks();
  });

  describe('wrapHandler() options', () => {
    test('flushTimeout', async () => {
      expect.assertions(1);

      const handler = () => {};
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337 });

      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(mockFlush).toBeCalledWith(1337);
    });

    test('captureTimeoutWarning enabled (default)', async () => {
      const handler: Handler = (_event, _context, callback) => {
        setTimeout(() => {
          callback(null, 42);
        }, DEFAULT_EXECUTION_TIME);
      };
      const wrappedHandler = wrapHandler(handler);
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(mockWithScope).toBeCalledTimes(1);
      expect(mockCaptureMessage).toBeCalled();
      expect(mockScope.setTag).toBeCalledWith('timeout', '1s');
    });

    test('captureTimeoutWarning disabled', async () => {
      const handler: Handler = (_event, _context, callback) => {
        setTimeout(() => {
          callback(null, 42);
        }, DEFAULT_EXECUTION_TIME);
      };
      const wrappedHandler = wrapHandler(handler, {
        captureTimeoutWarning: false,
      });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(mockWithScope).toBeCalledTimes(0);
      expect(mockCaptureMessage).not.toBeCalled();
      expect(mockScope.setTag).not.toBeCalledWith('timeout', '1s');
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

      expect(mockCaptureMessage).toBeCalled();
      expect(mockScope.setTag).toBeCalledWith('timeout', '1m40s');
    });

    test('captureAllSettledReasons disabled (default)', async () => {
      const handler = () => Promise.resolve([{ status: 'rejected', reason: new Error() }]);
      const wrappedHandler = wrapHandler(handler, { flushTimeout: 1337 });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      expect(mockCaptureException).toBeCalledTimes(0);
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
      expect(mockCaptureException).toHaveBeenNthCalledWith(1, error, expect.any(Function));
      expect(mockCaptureException).toHaveBeenNthCalledWith(2, error2, expect.any(Function));
      expect(mockCaptureException).toBeCalledTimes(2);
    });

    // "wrapHandler() ... successful execution" tests the default of startTrace enabled
    test('startTrace disabled', async () => {
      expect.assertions(3);

      const handler: Handler = async (_event, _context) => 42;
      const wrappedHandler = wrapHandler(handler, { startTrace: false });
      await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(mockScope.addEventProcessor).toBeCalledTimes(0);

      expect(mockScope.setTag).toBeCalledTimes(0);
      expect(mockStartSpanManual).toBeCalledTimes(0);
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
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
        },
      };

      expect(rv).toStrictEqual(42);
      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expectScopeSettings();

      expect(mockSpanEnd).toBeCalled();
      expect(mockFlush).toBeCalledWith(2000);
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
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
          },
        };

        expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

        expect(mockSpanEnd).toBeCalled();
        expect(mockFlush).toBeCalledWith(2000);
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
      expect.assertions(10);

      const error = new Error('wat');
      const handler: Handler = (_event, _context, _callback) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        const fakeTransactionContext = {
          name: 'functionName',
          op: 'function.aws.lambda',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
          },
        };

        expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(e, expect.any(Function));

        expect(mockSpanEnd).toBeCalled();
        expect(mockFlush).toBeCalled();
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
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
        },
      };

      expect(rv).toStrictEqual(42);
      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expectScopeSettings();

      expect(mockSpanEnd).toBeCalled();
      expect(mockFlush).toBeCalled();
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
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
          },
        };

        expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

        expect(mockSpanEnd).toBeCalled();
        expect(mockFlush).toBeCalled();
      }
    });

    test('should not throw when flush rejects', async () => {
      const handler: Handler = async () => {
        // Friendly handler with no errors :)
        return 'some string';
      };

      const wrappedHandler = wrapHandler(handler);

      mockFlush.mockImplementationOnce(() => Promise.reject(new Error('wat')));

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
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
        },
      };

      expect(rv).toStrictEqual(42);
      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expectScopeSettings();

      expect(mockSpanEnd).toBeCalled();
      expect(mockFlush).toBeCalled();
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
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
          },
        };

        expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

        expect(mockSpanEnd).toBeCalled();
        expect(mockFlush).toBeCalled();
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
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

      const scopeFunction = mockCaptureException.mock.calls[0][1];
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
      init({});

      expect(mockInit).toBeCalledWith(
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.aws-serverless',
              integrations: ['AWSLambda'],
              packages: [
                {
                  name: 'npm:@sentry/aws-serverless',
                  version: expect.any(String),
                },
              ],
              version: expect.any(String),
            },
          },
        }),
      );
    });
  });
});
