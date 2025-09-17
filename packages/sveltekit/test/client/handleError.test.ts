import * as SentrySvelte from '@sentry/svelte';
import type { HandleClientError, NavigationEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(_ => {});

describe('handleError (client)', () => {
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
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, {
        mechanism: { handled: false, type: 'auto.function.sveltekit.handle_error' },
      });
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
      expect(mockCaptureException).toHaveBeenCalledWith(mockError, {
        mechanism: { handled: true, type: 'auto.function.sveltekit.handle_error' },
      });

      // Check that the default handler wasn't invoked
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
    });
  });

  it.each([400, 401, 402, 403, 404, 429, 499])("doesn't capture %s errors", async statusCode => {
    const wrappedHandleError = handleErrorWithSentry(handleError);
    const returnVal = (await wrappedHandleError({
      error: new Error(`Error with status ${statusCode}`),
      event: navigationEvent,
      status: statusCode,
      message: `Error with status ${statusCode}`,
    })) as any;

    expect(returnVal.message).toEqual('Whoops!');
    expect(mockCaptureException).not.toHaveBeenCalled();
    // Check that the default handler wasn't invoked
    expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
  });
});
