import * as SentryCore from '@sentry/core';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wrapApiHandlerWithSentry', () => {
  it('should return a function that does not throw when no request is passed', async () => {
    const origFunction = vi.fn(() => new Response());

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction();
  });

  it('sets the parameterized transaction name on the isolation scope for requests', async () => {
    const setTransactionName = vi.fn();
    const setSDKProcessingMetadata = vi.fn();
    vi.spyOn(SentryCore, 'withIsolationScope').mockImplementation((cb: any) =>
      cb({ setTransactionName, setSDKProcessingMetadata }),
    );
    const parameterizedRoute = '/user/[userId]/post/[postId]';
    const wrappedFunction = wrapApiHandlerWithSentry(() => new Response(), parameterizedRoute);

    await wrappedFunction(new Request('https://dogs.are.great/user/123/post/456?good=true'));

    expect(setTransactionName).toHaveBeenCalledWith(`POST ${parameterizedRoute}`);
    expect(setSDKProcessingMetadata).toHaveBeenCalled();
  });

  it('sets a handler transaction name on the isolation scope for non-request args', async () => {
    const setTransactionName = vi.fn();
    vi.spyOn(SentryCore, 'withIsolationScope').mockImplementation((cb: any) =>
      cb({ setTransactionName, setSDKProcessingMetadata: vi.fn() }),
    );
    const parameterizedRoute = '/user/[userId]/post/[postId]';
    const wrappedFunction = wrapApiHandlerWithSentry(() => new Response(), parameterizedRoute);

    await wrappedFunction({ some: 'arg' } as any);

    expect(setTransactionName).toHaveBeenCalledWith(`handler (${parameterizedRoute})`);
  });

  it('captures and rethrows errors thrown by the handler', async () => {
    const captureException = vi.spyOn(SentryCore, 'captureException').mockReturnValue('');
    vi.spyOn(SentryCore, 'withIsolationScope').mockImplementation((cb: any) =>
      cb({ setTransactionName: vi.fn(), setSDKProcessingMetadata: vi.fn() }),
    );
    const error = new Error('Edge Route Error');
    const wrappedFunction = wrapApiHandlerWithSentry(() => {
      throw error;
    }, '/user/[userId]');

    await expect(wrappedFunction(new Request('https://dogs.are.great/user/123'))).rejects.toThrow('Edge Route Error');
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { type: 'auto.function.nextjs.wrap_api_handler', handled: false },
      }),
    );
  });
});
