import type { Event } from '@sentry/core';
import type { Callback, Handler } from 'aws-lambda';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { init } from '../src/init';
import { AWS_HANDLER_STREAMING_RESPONSE, AWS_HANDLER_STREAMING_SYMBOL, wrapHandler } from '../src/sdk';

const mockFlush = vi.fn((...args) => Promise.resolve(args));
const mockWithScope = vi.fn();
const mockCaptureMessage = vi.fn();
const mockCaptureException = vi.fn();
const mockInit = vi.fn();

const mockScope = {
  setTag: vi.fn(),
  setContext: vi.fn(),
  addEventProcessor: vi.fn(),
  setTransactionName: vi.fn(),
};

vi.mock('@sentry/node', async () => {
  const original = await vi.importActual('@sentry/node');
  return {
    ...original,
    initWithoutDefaultIntegrations: (options: unknown) => {
      mockInit(options);
    },
    getCurrentScope: () => {
      return mockScope;
    },
    flush: (...args: unknown[]) => {
      return mockFlush(...args);
    },
    withScope: (fn: (scope: unknown) => unknown) => {
      mockWithScope(fn);
      return fn(mockScope);
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

    vi.clearAllMocks();
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

      expect(mockWithScope).toBeCalledTimes(2);
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

      expect(mockWithScope).toBeCalledTimes(1);
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
  });

  describe('wrapHandler() on sync handler', () => {
    test('successful execution', async () => {
      expect.assertions(4);

      const handler: Handler = (_event, _context, callback) => {
        callback(null, 42);
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(rv).toStrictEqual(42);
      expectScopeSettings();

      expect(mockFlush).toBeCalledWith(2000);
    });

    test('unsuccessful execution', async () => {
      expect.assertions(4);

      const error = new Error('sorry');
      const handler: Handler = (_event, _context, callback) => {
        callback(error);
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch {
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

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
      expect.assertions(4);

      const error = new Error('wat');
      const handler: Handler = (_event, _context, _callback) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch (e) {
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(e, expect.any(Function));

        expect(mockFlush).toBeCalled();
      }
    });
  });

  describe('wrapHandler() on async handler', () => {
    test('successful execution', async () => {
      expect.assertions(4);

      const handler: Handler = async (_event, _context) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(rv).toStrictEqual(42);
      expectScopeSettings();

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
      expect.assertions(4);

      const error = new Error('wat');
      const handler: Handler = async (_event, _context) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch {
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

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
      expect.assertions(4);

      const handler: Handler = async (_event, _context, _callback) => {
        return 42;
      };
      const wrappedHandler = wrapHandler(handler);
      const rv = await wrappedHandler(fakeEvent, fakeContext, fakeCallback);

      expect(rv).toStrictEqual(42);
      expectScopeSettings();

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
      expect.assertions(4);

      const error = new Error('wat');
      const handler: Handler = async (_event, _context, _callback) => {
        throw error;
      };
      const wrappedHandler = wrapHandler(handler);

      try {
        await wrappedHandler(fakeEvent, fakeContext, fakeCallback);
      } catch {
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

        expect(mockFlush).toBeCalled();
      }
    });
  });

  describe('wrapHandler() on streaming handlers', () => {
    // Mock response stream with common stream interface
    const mockResponseStream = {
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      setContentType: vi.fn(),
      writable: true,
      writableEnded: false,
      writableFinished: false,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockResponseStream.write.mockClear();
      mockResponseStream.end.mockClear();
      mockResponseStream.destroy.mockClear();
      mockResponseStream.on.mockClear();
    });

    test('successful execution', async () => {
      expect.assertions(5);

      const streamingHandler = vi.fn(async (_event, _responseStream, _context) => {
        return 42;
      });
      // Add the streaming symbol to mark it as a streaming handler
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);
      const rv = await (wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext);

      expect(rv).toStrictEqual(42);
      expectScopeSettings();
      expect(streamingHandler).toHaveBeenCalledWith(fakeEvent, mockResponseStream, fakeContext);
      expect(mockFlush).toBeCalledWith(2000);
    });

    test('preserves streaming symbol on wrapped handler', () => {
      const streamingHandler = vi.fn(async (_event, _responseStream, _context) => {
        return 42;
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);

      expect((wrappedHandler as any)[AWS_HANDLER_STREAMING_SYMBOL]).toBe(AWS_HANDLER_STREAMING_RESPONSE);
    });

    test('event, responseStream and context are correctly passed along', async () => {
      expect.assertions(3);

      const streamingHandler = vi.fn(async (event, responseStream, context) => {
        expect(event).toHaveProperty('fortySix');
        expect(responseStream).toBe(mockResponseStream);
        expect(context).toHaveProperty('ytho');
        return 'success';
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);
      await (wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext);
    });

    test('capture error from handler execution', async () => {
      expect.assertions(4);

      const error = new Error('streaming handler error');
      const streamingHandler = vi.fn(async (_event, _responseStream, _context) => {
        throw error;
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);

      try {
        await (wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext);
      } catch {
        expectScopeSettings();
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));
        expect(mockFlush).toBeCalled();
      }
    });

    test('capture stream errors', async () => {
      expect.assertions(3);

      const streamError = new Error('stream error');
      const streamingHandler = vi.fn(async (_event, responseStream, _context) => {
        // Simulate stream error by calling the error listener
        const errorListener = responseStream.on.mock.calls.find((call: any[]) => call[0] === 'error')?.[1];
        if (errorListener) {
          errorListener(streamError);
        }
        return 'success';
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);
      await (wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext);

      expect(mockResponseStream.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockCaptureException).toHaveBeenCalledWith(streamError, expect.any(Function));
      expect(streamingHandler).toHaveBeenCalledWith(fakeEvent, mockResponseStream, fakeContext);
    });

    test('streaming handler with flushTimeout option', async () => {
      expect.assertions(2);

      const streamingHandler = vi.fn(async (_event, _responseStream, _context) => {
        return 'flushed';
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler, { flushTimeout: 5000 });
      const result = await (wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext);

      expect(result).toBe('flushed');
      expect(mockFlush).toBeCalledWith(5000);
    });

    test('streaming handler with captureTimeoutWarning enabled', async () => {
      const streamingHandler = vi.fn(async (_event, _responseStream, _context) => {
        // Simulate some delay to trigger timeout warning
        await new Promise(resolve => setTimeout(resolve, DEFAULT_EXECUTION_TIME));
        return 'completed';
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);
      await (wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext);

      expect(mockWithScope).toBeCalledTimes(2);
      expect(mockCaptureMessage).toBeCalled();
      expect(mockScope.setTag).toBeCalledWith('timeout', '1s');
    });

    test('marks streaming handler captured errors as unhandled', async () => {
      expect.assertions(3);

      const error = new Error('streaming error');
      const streamingHandler = vi.fn(async (_event, _responseStream, _context) => {
        throw error;
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);

      try {
        await (wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext);
      } catch {
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

        const scopeFunction = mockCaptureException.mock.calls[0]?.[1];
        const event: Event = { exception: { values: [{}] } };
        let evtProcessor: ((e: Event) => Event) | undefined = undefined;
        if (scopeFunction) {
          scopeFunction({ addEventProcessor: vi.fn().mockImplementation(proc => (evtProcessor = proc)) });
        }

        expect(evtProcessor).toBeInstanceOf(Function);
        // @ts-expect-error just mocking around...
        expect(evtProcessor!(event).exception.values[0]?.mechanism).toEqual({
          handled: false,
          type: 'auto.function.aws_serverless.handler',
        });
      }
    });

    test('should not throw when flush rejects with streaming handler', async () => {
      const streamingHandler = vi.fn(async (_event, _responseStream, _context) => {
        return 'flush-error-test';
      });
      (streamingHandler as any)[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

      const wrappedHandler = wrapHandler(streamingHandler);
      mockFlush.mockImplementationOnce(() => Promise.reject(new Error('flush failed')));

      await expect((wrappedHandler as any)(fakeEvent, mockResponseStream, fakeContext)).resolves.toBe(
        'flush-error-test',
      );
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
    } catch {
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

      const scopeFunction = mockCaptureException.mock.calls[0]?.[1];
      const event: Event = { exception: { values: [{}] } };
      let evtProcessor: ((e: Event) => Event) | undefined = undefined;
      scopeFunction({ addEventProcessor: vi.fn().mockImplementation(proc => (evtProcessor = proc)) });

      expect(evtProcessor).toBeInstanceOf(Function);
      // @ts-expect-error just mocking around...
      expect(evtProcessor(event).exception.values[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.function.aws_serverless.handler',
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
