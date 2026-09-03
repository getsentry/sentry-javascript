import * as SentryCore from '@sentry/core';
import type { HandleServerError, RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleErrorWithSentry } from '../../src/server-common/handleError';

const mockCaptureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'xx');

function handleError(_input: Parameters<HandleServerError>[0]): ReturnType<HandleServerError> {
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

    // purposefully omitting status and message to cover SvelteKit 1.x compatibility
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

    it.each([
      ['context', 'adapter-cloudflare <= 7'],
      ['ctx', 'adapter-cloudflare 8'],
    ])('calls waitUntil if available on platform.%s (%s)', async platformKey => {
      const wrappedHandleError = handleErrorWithSentry();
      const mockError = new Error('test');
      const waitUntilSpy = vi.fn();

      await wrappedHandleError({
        error: mockError,
        event: {
          ...requestEvent,
          platform: {
            [platformKey]: {
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

    it('prefers platform.ctx over platform.context when both are present', async () => {
      const wrappedHandleError = handleErrorWithSentry();
      const mockError = new Error('test');
      const ctxWaitUntilSpy = vi.fn();
      const contextWaitUntilSpy = vi.fn();

      await wrappedHandleError({
        error: mockError,
        event: {
          ...requestEvent,
          platform: {
            ctx: { waitUntil: ctxWaitUntilSpy },
            context: { waitUntil: contextWaitUntilSpy },
          },
        },
        status: 500,
        message: 'Internal Error',
      });

      expect(ctxWaitUntilSpy).toHaveBeenCalledTimes(1);
      expect(contextWaitUntilSpy).not.toHaveBeenCalled();
    });

    it('does not throw if the platform exposes no execution context', async () => {
      const wrappedHandleError = handleErrorWithSentry();
      const mockError = new Error('test');

      await wrappedHandleError({
        error: mockError,
        event: { ...requestEvent, platform: {} },
        status: 500,
        message: 'Internal Error',
      });

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });
  });
});

describe('handleError (server) [Kit 3.x]', () => {
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

    await wrappedHandleError({ kind: 'unknown', error: mockError, event: requestEvent });

    expect(mockCaptureException).toHaveBeenCalledWith(mockError, {
      mechanism: { type: 'auto.function.sveltekit.handle_error', handled: false },
    });
  });

  it.each(['app', 'framework'] as const)("doesn't capture 4xx %s errors", async kind => {
    const wrappedHandleError = handleErrorWithSentry();

    await wrappedHandleError({ kind, error: { status: 404, message: 'Not Found' }, event: requestEvent });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it.each(['app', 'framework'] as const)('captures 5xx %s errors', async kind => {
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = { status: 500, message: 'Internal Error' };

    await wrappedHandleError({ kind, error: mockError, event: requestEvent });

    expect(mockCaptureException).toHaveBeenCalledWith(mockError, {
      mechanism: { type: 'auto.function.sveltekit.handle_error', handled: false },
    });
  });

  it("doesn't capture remote function validation errors", async () => {
    const wrappedHandleError = handleErrorWithSentry();

    await wrappedHandleError({
      kind: 'validation',
      error: { status: 400, message: 'Bad Request' },
      issues: [{ message: 'Expected string' }],
      event: requestEvent,
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Remote function schema validation failed:', [
      { message: 'Expected string' },
    ]);
  });

  it('captures errors whose status we cannot determine', async () => {
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = { message: 'no status here' };

    await wrappedHandleError({ kind: 'app', error: mockError, event: requestEvent });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('never reads the deprecated `status` and `message` input properties', async () => {
    // In SvelteKit 3 dev builds these only exist as deprecated getters that log a warning when read
    const statusGetter = vi.fn().mockReturnValue(500);
    const messageGetter = vi.fn().mockReturnValue('Internal Error');

    const input = { kind: 'framework' as const, error: { status: 404, message: 'Not Found' }, event: requestEvent };
    Object.defineProperties(input, {
      status: { get: statusGetter },
      message: { get: messageGetter },
    });

    await handleErrorWithSentry()(input);

    expect(statusGetter).not.toHaveBeenCalled();
    expect(messageGetter).not.toHaveBeenCalled();
  });

  it('calls the user-provided handler for both captured and skipped errors', async () => {
    const userHandler = vi.fn().mockReturnValue({ message: 'Whoops!' });
    const wrappedHandleError = handleErrorWithSentry(userHandler);

    const captured = { kind: 'unknown' as const, error: new Error('boom'), event: requestEvent };
    const skipped = { kind: 'app' as const, error: { status: 404, message: 'Not Found' }, event: requestEvent };

    expect(await wrappedHandleError(captured)).toEqual({ message: 'Whoops!' });
    expect(await wrappedHandleError(skipped)).toEqual({ message: 'Whoops!' });

    expect(userHandler).toHaveBeenNthCalledWith(1, captured);
    expect(userHandler).toHaveBeenNthCalledWith(2, skipped);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  describe('default error handler', () => {
    it('logs the stack traces of an unexpected error and its causes', async () => {
      const cause = new Error('the cause');
      const error = new Error('boom');
      // set explicitly: the `ErrorOptions` constructor overload needs a newer lib than we compile against
      (error as Error & { cause?: unknown }).cause = cause;

      await handleErrorWithSentry()({ kind: 'unknown', error, event: requestEvent });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(1, error.stack);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, cause.stack);
    });

    it.each(['app', 'framework'] as const)("doesn't log %s errors", async kind => {
      await handleErrorWithSentry()({ kind, error: { status: 500, message: 'Internal Error' }, event: requestEvent });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});

describe('handleErrorWithSentry (server) types', () => {
  it("stays assignable to SvelteKit's `HandleServerError`", () => {
    const withDefaultHandler: HandleServerError = handleErrorWithSentry();
    const withCustomHandler: HandleServerError = handleErrorWithSentry(handleError);

    expect(withDefaultHandler).toBeTypeOf('function');
    expect(withCustomHandler).toBeTypeOf('function');
  });
});

describe('handleError (server) validation errors', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    consoleErrorSpy.mockClear();
  });

  // SvelteKit always gives validation errors a 400, so the status rule alone would cover them.
  // These pin the explicit `kind` check, so the behaviour doesn't depend on that Kit internal.
  it.each([undefined, 500, 503])("doesn't capture a validation error with status %s", async status => {
    const wrappedHandleError = handleErrorWithSentry();

    await wrappedHandleError({
      kind: 'validation',
      error: { status, message: 'Bad Request' },
      issues: [{ message: 'Expected string' }],
      event: requestEvent,
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
