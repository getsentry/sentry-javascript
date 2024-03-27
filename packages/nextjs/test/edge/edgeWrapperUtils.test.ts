import * as coreSdk from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';

import { withEdgeWrapping } from '../../src/common/utils/edgeWrapperUtils';

const origRequest = global.Request;
const origResponse = global.Response;

// @ts-expect-error Request does not exist on type Global
global.Request = class Request {
  headers = {
    get() {
      return null;
    },
  };
};

// @ts-expect-error Response does not exist on type Global
global.Response = class Request {};

afterAll(() => {
  global.Request = origRequest;
  global.Response = origResponse;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('withEdgeWrapping', () => {
  it('should return a function that calls the passed function', async () => {
    const origFunctionReturnValue = new Response();
    const origFunction = jest.fn(_req => origFunctionReturnValue);

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    const returnValue = await wrappedFunction(new Request('https://sentry.io/'));

    expect(returnValue).toBe(origFunctionReturnValue);
    expect(origFunction).toHaveBeenCalledTimes(1);
  });

  it('should return a function that calls captureException on error', async () => {
    const captureExceptionSpy = jest.spyOn(coreSdk, 'captureException');
    const error = new Error();
    const origFunction = jest.fn(_req => {
      throw error;
    });

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    await expect(wrappedFunction(new Request('https://sentry.io/'))).rejects.toBe(error);
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it('should return a function that calls trace', async () => {
    const startSpanSpy = jest.spyOn(coreSdk, 'startSpan');

    const request = new Request('https://sentry.io/');
    const origFunction = jest.fn(_req => new Response());

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    await wrappedFunction(request);

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [coreSdk.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.withEdgeWrapping',
        },
        name: 'some label',
        op: 'some op',
      }),
      expect.any(Function),
    );

    expect(coreSdk.getIsolationScope().getScopeData().sdkProcessingMetadata).toEqual({
      request: { headers: {} },
    });
  });

  it("should return a function that doesn't crash when req isn't passed", async () => {
    const origFunctionReturnValue = new Response();
    const origFunction = jest.fn(() => origFunctionReturnValue);

    const wrappedFunction = withEdgeWrapping(origFunction, {
      spanDescription: 'some label',
      mechanismFunctionName: 'some name',
      spanOp: 'some op',
    });

    await expect(wrappedFunction()).resolves.toBe(origFunctionReturnValue);
    expect(origFunction).toHaveBeenCalledTimes(1);
  });
});
