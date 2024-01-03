import * as coreSdk from '@sentry/core';

import { wrapApiHandlerWithSentry } from '../../src/edge';

// @ts-expect-error Request does not exist on type Global
const origRequest = global.Request;
// @ts-expect-error Response does not exist on type Global
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
  // @ts-expect-error Request does not exist on type Global
  global.Request = origRequest;
  // @ts-expect-error Response does not exist on type Global
  global.Response = origResponse;
});

const traceSpy = jest.spyOn(coreSdk, 'trace');

afterEach(() => {
  jest.clearAllMocks();
});

describe('wrapApiHandlerWithSentry', () => {
  it('should return a function that calls trace', async () => {
    const request = new Request('https://sentry.io/');
    const origFunction = jest.fn(_req => new Response());

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction(request);

    expect(traceSpy).toHaveBeenCalledTimes(1);
    expect(traceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { request: { headers: {}, method: 'POST', url: 'https://sentry.io/' }, source: 'route' },
        name: 'POST /user/[userId]/post/[postId]',
        op: 'http.server',
        origin: 'auto.function.nextjs.withEdgeWrapping',
      }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('should return a function that calls trace without throwing when no request is passed', async () => {
    const origFunction = jest.fn(() => new Response());

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction();

    expect(traceSpy).toHaveBeenCalledTimes(1);
    expect(traceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { source: 'route' },
        name: 'handler (/user/[userId]/post/[postId])',
        op: 'http.server',
        origin: 'auto.function.nextjs.withEdgeWrapping',
      }),
      expect.any(Function),
      expect.any(Function),
    );
  });
});
