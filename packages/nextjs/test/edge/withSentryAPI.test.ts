import * as SentryCore from '@sentry/core';
import { HTTP_ROUTE, URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
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

  it('adds normalized request URL and route attributes to the active root span', async () => {
    const rootSpan = {
      updateName: vi.fn(),
      setAttributes: vi.fn(),
    };
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValueOnce({} as any);
    vi.spyOn(SentryCore, 'getRootSpan').mockReturnValueOnce(rootSpan as any);
    vi.spyOn(SentryCore, 'spanToJSON').mockReturnValueOnce({ data: {} } as any);
    const origFunction = vi.fn(() => new Response());
    const parameterizedRoute = '/user/[userId]/post/[postId]';
    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, parameterizedRoute);

    await wrappedFunction(new Request('https://dogs.are.great/user/123/post/456?good=true'));

    expect(rootSpan.updateName).toHaveBeenCalledWith(`POST ${parameterizedRoute}`);
    expect(rootSpan.setAttributes).toHaveBeenCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      [URL_FULL]: 'https://dogs.are.great/user/123/post/456?good=true',
      [URL_PATH]: '/user/123/post/456',
      [HTTP_ROUTE]: parameterizedRoute,
    });
  });

  it('replaces a concrete root span route with the parameterized route', async () => {
    const rootSpan = {
      updateName: vi.fn(),
      setAttributes: vi.fn(),
    };
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValueOnce({} as any);
    vi.spyOn(SentryCore, 'getRootSpan').mockReturnValueOnce(rootSpan as any);
    vi.spyOn(SentryCore, 'spanToJSON').mockReturnValueOnce({
      data: { [HTTP_ROUTE]: '/user/123/post/456' },
    } as any);
    const parameterizedRoute = '/user/[userId]/post/[postId]';
    const wrappedFunction = wrapApiHandlerWithSentry(() => new Response(), parameterizedRoute);

    await wrappedFunction(new Request('https://dogs.are.great/user/123/post/456'));

    expect(rootSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        [HTTP_ROUTE]: parameterizedRoute,
      }),
    );
  });
});
