import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../../src/common/span-attributes-with-logic-attached';
import { wrapMiddlewareWithSentry } from '../../src/common/wrapMiddlewareWithSentry';

const globalWithInjectedValues = globalThis as typeof globalThis & {
  _sentryRewritesTunnelPath?: string;
  _sentryTunnelRouteMode?: string;
};

describe('wrapMiddlewareWithSentry', () => {
  beforeEach(() => {
    vi.spyOn(SentryCore, 'captureException').mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalWithInjectedValues._sentryRewritesTunnelPath;
    delete globalWithInjectedValues._sentryTunnelRouteMode;
  });

  it('does not start its own span when the Next.js OTEL root span is already active (Next.js >= 14)', async () => {
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

  it('starts its own span when no span is active (Next.js 13)', async () => {
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(undefined);
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

    const handler = vi.fn(async (_req: Request) => new Response('ok'));
    const wrapped = wrapMiddlewareWithSentry(handler);

    await wrapped(new Request('https://example.com/foo', { method: 'GET' }));

    expect(handler).toHaveBeenCalledTimes(1);
    // Next.js 13 never emits `Middleware.execute`, so without this span there would be no middleware transaction.
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'middleware GET',
        op: 'http.server.middleware',
      }),
      expect.any(Function),
    );
  });

  describe('on Next.js 13 with a tunnel route handler', () => {
    beforeEach(() => {
      vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(undefined);
      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
      globalWithInjectedValues._sentryTunnelRouteMode = 'handler';
    });

    it('runs the middleware and marks its span for tunnel requests to be dropped', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const handler = vi.fn(async (_req: Request) => new Response('ok'));

      await wrapMiddlewareWithSentry(handler)(new Request('https://example.com/monitoring', { method: 'POST' }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({ [TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION]: true }),
        }),
        expect.any(Function),
      );
    });

    it.each([
      ['a sub-path of the tunnel route', 'https://example.com/monitoring/dashboard'],
      ['a path that starts like the tunnel route', 'https://example.com/monitoring-old'],
    ])('keeps the span of %s', async (_description, url) => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

      await wrapMiddlewareWithSentry(async (_req: Request) => new Response('ok'))(new Request(url, { method: 'POST' }));

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.not.objectContaining({ [TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION]: true }),
        }),
        expect.any(Function),
      );
    });

    it('keeps the span of tunnel requests in rewrite mode', async () => {
      globalWithInjectedValues._sentryTunnelRouteMode = 'rewrite';
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

      await wrapMiddlewareWithSentry(async (_req: Request) => new Response('ok'))(
        new Request('https://example.com/monitoring?o=abc', { method: 'POST' }),
      );

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.not.objectContaining({ [TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION]: true }),
        }),
        expect.any(Function),
      );
    });
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
