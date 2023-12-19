import * as SentrySvelte from '@sentry/svelte';
import type { HandleClientError, NavigationEvent } from '@sveltejs/kit';
import { vi } from 'vitest';

import { handleErrorWithSentry } from '../../src/client/handleError';

const mockCaptureException = vi.spyOn(SentrySvelte, 'captureException').mockImplementation(() => 'xx');

function handleError(_input: { error: unknown; event: NavigationEvent }): ReturnType<HandleClientError> {
  return {
    message: 'Whoops!',
  };
}

const navigationEvent: NavigationEvent = {
  params: {
    id: '123',
  },
  route: {
    id: 'users/[id]',
  },
  url: new URL('http://example.org/users/123'),
};

const captureExceptionEventHint = {
  mechanism: { handled: false, type: 'sveltekit' },
};

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(_ => {});

describe('handleError', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    consoleErrorSpy.mockClear();
  });

  describe('calls captureException', () => {
    it('invokes the default handler if no handleError func is provided', async () => {
      const wrappedHandleError = handleErrorWithSentry();
      const mockError = new Error('test');
      // @ts-expect-error - purposefully omitting status and message to cover SvelteKit 1.x compatibility
      const returnVal = await wrappedHandleError({ error: mockError, event: navigationEvent });

      expect(returnVal).not.toBeDefined();
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, captureExceptionEventHint);
      // The default handler logs the error to the console
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('invokes the user-provided error handler', async () => {
      const wrappedHandleError = handleErrorWithSentry(handleError);
      const mockError = new Error('test');
      // @ts-expect-error - purposefully omitting status and message to cover SvelteKit 1.x compatibility
      const returnVal = (await wrappedHandleError({ error: mockError, event: navigationEvent })) as any;

      expect(returnVal.message).toEqual('Whoops!');
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, captureExceptionEventHint);
      // Check that the default handler wasn't invoked
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
    });
  });

  it("doesn't capture 404 errors", async () => {
    const wrappedHandleError = handleErrorWithSentry(handleError);
    const returnVal = (await wrappedHandleError({
      error: new Error('404 Not Found'),
      event: navigationEvent,
      status: 404,
      message: 'Not Found',
    })) as any;

    expect(returnVal.message).toEqual('Whoops!');
    expect(mockCaptureException).not.toHaveBeenCalled();
    // Check that the default handler wasn't invoked
    expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
  });
});
