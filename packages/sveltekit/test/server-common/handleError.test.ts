import * as SentryCore from '@sentry/core';
import type { HandleServerError, RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleErrorWithSentry } from '../../src/server-common/handleError';

const mockCaptureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'xx');

function handleError(_input: { error: unknown; event: RequestEvent }): ReturnType<HandleServerError> {
  return {
    message: 'Whoops!',
  };
}

const requestEvent = {} as RequestEvent;

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(_ => {});

describe('handleError (server)', () => {
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

  it.each([400, 401, 402, 403, 404, 429, 499])(
    "doesn't capture %s errors for incorrect navigations [Kit 2.x]",
    async statusCode => {
      const wrappedHandleError = handleErrorWithSentry();

      const returnVal = await wrappedHandleError({
        error: new Error(`Error with status ${statusCode}`),
        event: requestEvent,
        status: statusCode,
        message: `Error with status ${statusCode}`,
      });

      expect(returnVal).not.toBeDefined();
      expect(mockCaptureException).toHaveBeenCalledTimes(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    },
  );

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
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, {
        mechanism: { handled: false, type: 'auto.function.sveltekit.handle_error' },
      });
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
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, {
        mechanism: { handled: true, type: 'auto.function.sveltekit.handle_error' },
      });
      // Check that the default handler wasn't invoked
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
    });

    it('calls waitUntil if available', async () => {
      const wrappedHandleError = handleErrorWithSentry();
      const mockError = new Error('test');
      const waitUntilSpy = vi.fn();

      await wrappedHandleError({
        error: mockError,
        event: {
          ...requestEvent,
          platform: {
            context: {
              waitUntil: waitUntilSpy,
            },
          },
        },
        status: 500,
        message: 'Internal Error',
      });

      expect(waitUntilSpy).toHaveBeenCalledTimes(1);
      // flush() returns a promise, this is what we expect here
      expect(waitUntilSpy).toHaveBeenCalledWith(expect.any(Promise));
    });
  });
});
