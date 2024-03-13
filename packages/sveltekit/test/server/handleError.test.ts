import * as SentryNode from '@sentry/node';
import type { HandleServerError, RequestEvent } from '@sveltejs/kit';
import { vi } from 'vitest';

import { handleErrorWithSentry } from '../../src/server/handleError';

const mockCaptureException = vi.spyOn(SentryNode, 'captureException').mockImplementation(() => 'xx');

const captureExceptionEventHint = {
  mechanism: { handled: false, type: 'sveltekit' },
};

function handleError(_input: { error: unknown; event: RequestEvent }): ReturnType<HandleServerError> {
  return {
    message: 'Whoops!',
  };
}

const requestEvent = {} as RequestEvent;

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(_ => {});

describe('handleError', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    consoleErrorSpy.mockClear();
  });

  it('doesn\'t capture "Not found" errors for incorrect navigations [Kit 1.x]', async () => {
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = new Error('Not found: /asdf/123');
    const mockEvent = {
      url: new URL('https://myDomain.com/asdf/123'),
      route: { id: null }, // <-- this is what SvelteKit puts in the event when the page is not found
      // ...
    } as RequestEvent;

    // @ts-expect-error - purposefully omitting status and message to cover SvelteKit 1.x compatibility
    const returnVal = await wrappedHandleError({ error: mockError, event: mockEvent });

    expect(returnVal).not.toBeDefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(0);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('doesn\'t capture "Not found" errors for incorrect navigations [Kit 2.x]', async () => {
    const wrappedHandleError = handleErrorWithSentry();

    const returnVal = await wrappedHandleError({
      error: new Error('404 /asdf/123'),
      event: requestEvent,
      status: 404,
      message: 'Not Found',
    });

    expect(returnVal).not.toBeDefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(0);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  describe('calls captureException', () => {
    it('invokes the default handler if no handleError func is provided', async () => {
      const wrappedHandleError = handleErrorWithSentry();
      const mockError = new Error('test');
      const returnVal = await wrappedHandleError({
        error: mockError,
        event: requestEvent,
        status: 500,
        message: 'Internal Error',
      });

      expect(returnVal).not.toBeDefined();
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, captureExceptionEventHint);
      // The default handler logs the error to the console
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('invokes the user-provided error handler', async () => {
      const wrappedHandleError = handleErrorWithSentry(handleError);
      const mockError = new Error('test');
      const returnVal = (await wrappedHandleError({
        error: mockError,
        event: requestEvent,
        status: 500,
        message: 'Internal Error',
      })) as any;

      expect(returnVal.message).toEqual('Whoops!');
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, captureExceptionEventHint);
      // Check that the default handler wasn't invoked
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
    });
  });
});
