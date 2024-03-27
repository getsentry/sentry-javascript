import * as coreSdk from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';

import { wrapApiHandlerWithSentry } from '../../src/edge';

const origRequest = global.Request;
const origResponse = global.Response;

// @ts-expect-error Request does not exist on type Global
global.Request = class Request {
  public url: string;

  public headers = {
    get() {
      return null;
    },
  };

  public method = 'POST';

  public constructor(input: string) {
    this.url = input;
  }
};

// @ts-expect-error Response does not exist on type Global
global.Response = class Response {};

afterAll(() => {
  global.Request = origRequest;
  global.Response = origResponse;
});

const startSpanSpy = jest.spyOn(coreSdk, 'startSpan');

afterEach(() => {
  jest.clearAllMocks();
});

describe('wrapApiHandlerWithSentry', () => {
  it('should return a function that calls trace', async () => {
    const request = new Request('https://sentry.io/');
    const origFunction = jest.fn(_req => new Response());

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction(request);

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.withEdgeWrapping',
        },
        name: 'POST /user/[userId]/post/[postId]',
        op: 'http.server',
      }),
      expect.any(Function),
    );

    expect(coreSdk.getIsolationScope().getScopeData().sdkProcessingMetadata).toEqual({
      request: { headers: {}, method: 'POST', url: 'https://sentry.io/' },
    });
  });

  it('should return a function that calls trace without throwing when no request is passed', async () => {
    const origFunction = jest.fn(() => new Response());

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction();

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [coreSdk.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.withEdgeWrapping',
        },
        name: 'handler (/user/[userId]/post/[postId])',
        op: 'http.server',
      }),
      expect.any(Function),
    );

    expect(coreSdk.getIsolationScope().getScopeData().sdkProcessingMetadata).toEqual({});
  });
});
