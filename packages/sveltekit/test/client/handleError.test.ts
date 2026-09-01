import * as SentrySvelte from '@sentry/svelte';
import type { HandleClientError, NavigationEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleErrorWithSentry } from '../../src/client/handleError';

const mockCaptureException = vi.spyOn(SentrySvelte, 'captureException').mockImplementation(() => 'xx');

function handleError(_input: Parameters<HandleClientError>[0]): ReturnType<HandleClientError> {
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
      // purposefully omitting status and message to cover SvelteKit 1.x compatibility
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

  it.each([400, 401, 403, 404, 429, 499])(
    "doesn't capture %s errors embedded in __data.json (HTTP 200 wrapper)",
    async statusCode => {
      const wrappedHandleError = handleErrorWithSentry(handleError);
      await wrappedHandleError({
        // SvelteKit resolves get_status() to 500 for plain deserialized error objects
        status: 500,
        error: { type: 'error', error: { message: `Error: ${statusCode}` }, status: statusCode },
        event: navigationEvent,
        message: `Error: ${statusCode}`,
      });

      expect(mockCaptureException).not.toHaveBeenCalled();
    },
  );
});

describe('handleError (client) [Kit 3.x]', () => {
  // SvelteKit 3 passes *every* error to `handleError`, discriminated by `kind`, and moved the
  // status from the input onto the error itself.
  // see: https://svelte.dev/docs/kit/hooks#handleError
  beforeEach(() => {
    mockCaptureException.mockClear();
    consoleErrorSpy.mockClear();
  });

  it('captures unexpected errors', async () => {
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = new Error('boom');

    await wrappedHandleError({ kind: 'unknown', error: mockError, event: navigationEvent });

    expect(mockCaptureException).toHaveBeenCalledWith(mockError, {
      mechanism: { type: 'auto.function.sveltekit.handle_error', handled: false },
    });
  });

  it('captures unexpected errors that happen to carry a 4xx `status` property', async () => {
    // The SvelteKit 2 heuristic looked at `error.status` and would have skipped this one
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = { message: 'a failed fetch response', status: 404 };

    await wrappedHandleError({ kind: 'unknown', error: mockError, event: navigationEvent });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it.each(['app', 'framework'] as const)("doesn't capture 4xx %s errors", async kind => {
    const wrappedHandleError = handleErrorWithSentry();

    await wrappedHandleError({ kind, error: { status: 404, message: 'Not Found' }, event: navigationEvent });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it.each(['app', 'framework'] as const)('captures 5xx %s errors', async kind => {
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = { status: 500, message: 'Internal Error' };

    await wrappedHandleError({ kind, error: mockError, event: navigationEvent });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('never reads the deprecated `status` and `message` input properties', async () => {
    // In SvelteKit 3 dev builds these only exist as deprecated getters that log a warning when read
    const statusGetter = vi.fn().mockReturnValue(500);
    const messageGetter = vi.fn().mockReturnValue('Internal Error');

    const input = { kind: 'framework' as const, error: { status: 404, message: 'Not Found' }, event: navigationEvent };
    Object.defineProperties(input, {
      status: { get: statusGetter },
      message: { get: messageGetter },
    });

    await handleErrorWithSentry()(input);

    expect(statusGetter).not.toHaveBeenCalled();
    expect(messageGetter).not.toHaveBeenCalled();
  });

  describe('default error handler', () => {
    it('logs unexpected errors', async () => {
      const error = new Error('boom');

      await handleErrorWithSentry()({ kind: 'unknown', error, event: navigationEvent });

      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    });

    it.each(['app', 'framework'] as const)("doesn't log %s errors", async kind => {
      await handleErrorWithSentry()({
        kind,
        error: { status: 500, message: 'Internal Error' },
        event: navigationEvent,
      });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});

describe('handleErrorWithSentry (client) types', () => {
  it("stays assignable to SvelteKit's `HandleClientError`", () => {
    const withDefaultHandler: HandleClientError = handleErrorWithSentry();
    const withCustomHandler: HandleClientError = handleErrorWithSentry(handleError);

    expect(withDefaultHandler).toBeTypeOf('function');
    expect(withCustomHandler).toBeTypeOf('function');
  });
});
