import * as coreSdk from '@sentry/core';

import { wrapApiHandlerWithSentry } from '../../src/edge';

// The wrap* functions require the hub to have tracing extensions. This is normally called by the EdgeClient
// constructor but the client isn't used in these tests.
coreSdk.addTracingExtensions();

// @ts-expect-error Request does not exist on type Global
const origRequest = global.Request;
// @ts-expect-error Response does not exist on type Global
const origResponse = global.Response;

// @ts-expect-error Request does not exist on type Global
global.Request = class Request {
  headers = {
    get() {
      return null;
    },
  };

  method = 'POST';
};

// @ts-expect-error Response does not exist on type Global
global.Response = class Request {};

afterAll(() => {
  // @ts-expect-error Request does not exist on type Global
  global.Request = origRequest;
  // @ts-expect-error Response does not exist on type Global
  global.Response = origResponse;
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(coreSdk, 'hasTracingEnabled').mockImplementation(() => true);
});

describe('wrapApiHandlerWithSentry', () => {
  it('should return a function that starts a transaction with the correct name when there is no active transaction and a request is being passed', async () => {
    const startTransactionSpy = jest.spyOn(coreSdk, 'startTransaction');

    const origFunctionReturnValue = new Response();
    const origFunction = jest.fn(_req => origFunctionReturnValue);

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    const request = new Request('https://sentry.io/');
    await wrappedFunction(request);
    expect(startTransactionSpy).toHaveBeenCalledTimes(1);
    expect(startTransactionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ source: 'route' }),
        name: 'POST /user/[userId]/post/[postId]',
        op: 'http.server',
      }),
    );
  });

  it('should return a function that should not start a transaction when there is no active span and no request is being passed', async () => {
    const startTransactionSpy = jest.spyOn(coreSdk, 'startTransaction');

    const origFunctionReturnValue = new Response();
    const origFunction = jest.fn(() => origFunctionReturnValue);

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction();
    expect(startTransactionSpy).not.toHaveBeenCalled();
  });

  it('should return a function that starts a span on the current transaction with the correct description when there is an active transaction and no request is being passed', async () => {
    const testTransaction = coreSdk.startTransaction({ name: 'testTransaction' });
    coreSdk.getCurrentHub().getScope().setSpan(testTransaction);

    const startChildSpy = jest.spyOn(testTransaction, 'startChild');

    const origFunctionReturnValue = new Response();
    const origFunction = jest.fn(() => origFunctionReturnValue);

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction();
    expect(startChildSpy).toHaveBeenCalledTimes(1);
    expect(startChildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'handler (/user/[userId]/post/[postId])',
        op: 'function',
      }),
    );

    testTransaction.finish();
    coreSdk.getCurrentHub().getScope().setSpan(undefined);
  });
});
