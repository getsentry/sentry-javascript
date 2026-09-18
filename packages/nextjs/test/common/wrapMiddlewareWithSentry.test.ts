import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapMiddlewareWithSentry } from '../../src/common/wrapMiddlewareWithSentry';

describe('wrapMiddlewareWithSentry', () => {
  beforeEach(() => {
    vi.spyOn(SentryCore, 'captureException').mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not start its own span when the Next.js OTEL root span is already active', async () => {
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({} as SentryCore.Span);
    vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue({} as SentryCore.Span);
    const setCapturedScopesSpy = vi.spyOn(SentryCore, 'setCapturedScopesOnSpan').mockReturnValue(undefined);
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

    const handler = vi.fn(async (_req: Request) => new Response('ok'));
    const wrapped = wrapMiddlewareWithSentry(handler);

    await wrapped(new Request('https://example.com/foo', { method: 'GET' }));

    // The middleware runs and our forked scopes are bound to the existing OTEL root span...
    expect(handler).toHaveBeenCalledTimes(1);
    expect(setCapturedScopesSpy).toHaveBeenCalledTimes(1);
    // ...but the wrapper never starts a span itself - the `Middleware.execute` span is the transaction.
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('does not start its own span when no span is active', async () => {
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(undefined);
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

    const handler = vi.fn(async (_req: Request) => new Response('ok'));
    const wrapped = wrapMiddlewareWithSentry(handler);

    await wrapped(new Request('https://example.com/foo', { method: 'GET' }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('captures errors thrown by the middleware when a root span is already active', async () => {
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({} as SentryCore.Span);
    vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue({} as SentryCore.Span);
    vi.spyOn(SentryCore, 'setCapturedScopesOnSpan').mockReturnValue(undefined);
    const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('');

    const error = new Error('boom');
    const handler = vi.fn(async (_req: Request) => {
      throw error;
    });
    const wrapped = wrapMiddlewareWithSentry(handler);

    await expect(wrapped(new Request('https://example.com/foo', { method: 'GET' }))).rejects.toThrow('boom');

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { type: 'auto.function.nextjs.wrap_middleware', handled: false },
      }),
    );
  });

  it('captures errors thrown by the middleware when no span is active', async () => {
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(undefined);
    const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('');

    const error = new Error('boom');
    const handler = vi.fn(async (_req: Request) => {
      throw error;
    });
    const wrapped = wrapMiddlewareWithSentry(handler);

    await expect(wrapped(new Request('https://example.com/foo', { method: 'GET' }))).rejects.toThrow('boom');

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });
});
