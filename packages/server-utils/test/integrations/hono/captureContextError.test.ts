import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureContextError } from '../../../src/integrations/hono/middlewareHandlers';

// oxlint-disable-next-line typescript/no-explicit-any
const contextWithError = (error: unknown): any => ({ req: {}, error });

describe('captureContextError', () => {
  let captureExceptionSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures the value inside the Hono 5 non-Error wrapper with the context error mechanism', () => {
    const thrown = { code: 'ECONNRESET', retryable: true };

    captureContextError(contextWithError(new Error(undefined, { cause: thrown })));

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(thrown, {
      mechanism: { handled: false, type: 'auto.http.hono.context_error' },
    });
  });

  it('gives the unwrapped value to shouldHandleError', () => {
    const shouldHandleError = vi.fn(() => false);

    captureContextError(
      contextWithError(new Error('Payment provider timed out', { cause: 'Payment provider timed out' })),
      shouldHandleError,
    );

    expect(shouldHandleError).toHaveBeenCalledWith('Payment provider timed out');
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('does not capture a wrapped object with a 4xx status', () => {
    captureContextError(contextWithError(new Error(undefined, { cause: { status: 404, reason: 'Order not found' } })));

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });
});
