import type { Client } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  wrapGetInitialPropsWithSentry,
  wrapGetServerSidePropsWithSentry,
  wrapMiddlewareWithSentry,
} from '../../src/common';
import type { EdgeRouteHandler } from '../../src/edge/types';

const startSpanManualSpy = vi.spyOn(SentryCore, 'startSpanManual');

describe('data-fetching function wrappers should not create manual spans', () => {
  const route = '/tricks/[trickName]';
  let req: IncomingMessage;
  let res: ServerResponse;

  beforeEach(() => {
    req = { headers: {}, url: 'http://dogs.are.great/tricks/kangaroo' } as IncomingMessage;
    res = { end: vi.fn() } as unknown as ServerResponse;

    vi.spyOn(SentryCore, 'hasSpansEnabled').mockReturnValue(true);
    vi.spyOn(SentryCore, 'getClient').mockImplementation(() => {
      return {
        getOptions: () => ({}),
        getDsn: () => {},
      } as Client;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('wrapGetServerSidePropsWithSentry', async () => {
    const origFunction = vi.fn(async () => ({ props: {} }));

    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);
    await wrappedOriginal({ req, res } as any);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  test('wrapGetInitialPropsWithSentry', async () => {
    const origFunction = vi.fn(async () => ({}));

    const wrappedOriginal = wrapGetInitialPropsWithSentry(origFunction);
    await wrappedOriginal({ req, res, pathname: route } as any);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  test('wrapped function sets route backfill attribute when called within an active span', async () => {
    const mockSetAttribute = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockGetActiveSpan = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
      setAttributes: mockSetAttributes,
    } as any);
    const mockGetRootSpan = vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
      setAttributes: mockSetAttributes,
    } as any);

    const origFunction = vi.fn(async () => ({ props: {} }));
    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);

    await wrappedOriginal({ req, res } as any);

    expect(mockGetActiveSpan).toHaveBeenCalled();
    expect(mockGetRootSpan).toHaveBeenCalled();
    expect(mockSetAttribute).toHaveBeenCalledWith('sentry.route_backfill', '/tricks/[trickName]');
  });

  test('wrapped function does not set route backfill attribute for /_error route', async () => {
    const mockSetAttribute = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockGetActiveSpan = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
      setAttributes: mockSetAttributes,
    } as any);
    const mockGetRootSpan = vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
      setAttributes: mockSetAttributes,
    } as any);

    const origFunction = vi.fn(async () => ({ props: {} }));
    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, '/_error');

    await wrappedOriginal({ req, res } as any);

    expect(mockGetActiveSpan).toHaveBeenCalled();
    expect(mockGetRootSpan).not.toHaveBeenCalled();
    expect(mockSetAttribute).not.toHaveBeenCalled();
  });
});

describe('wrapMiddlewareWithSentry', () => {
  afterEach(() => {
    vi.clearAllMocks();
    if ('_sentryRewritesTunnelPath' in globalThis) {
      delete (globalThis as any)._sentryRewritesTunnelPath;
    }
  });

  test('should skip processing and return NextResponse.next() for tunnel route requests', async () => {
    // Set up tunnel route in global
    (globalThis as any)._sentryRewritesTunnelPath = '/monitoring/tunnel';

    const origFunction: EdgeRouteHandler = vi.fn(async () => ({ status: 200 }));
    const wrappedOriginal = wrapMiddlewareWithSentry(origFunction);

    // Create a mock Request that matches the tunnel route
    const mockRequest = new Request('https://example.com/monitoring/tunnel?o=123');

    const result = await wrappedOriginal(mockRequest);

    // Should skip calling the original function
    expect(origFunction).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('should process normal request and call original function', async () => {
    const mockReturnValue = { status: 200 };
    const origFunction: EdgeRouteHandler = vi.fn(async (..._args) => mockReturnValue);
    const wrappedOriginal = wrapMiddlewareWithSentry(origFunction);

    const mockRequest = new Request('https://example.com/api/users', { method: 'GET' });

    const result = await wrappedOriginal(mockRequest);

    expect(origFunction).toHaveBeenCalledWith(mockRequest);
    expect(result).toBe(mockReturnValue);
  });

  test('should handle non-Request arguments', async () => {
    const mockReturnValue = { status: 200 };
    const origFunction: EdgeRouteHandler = vi.fn(async (..._args) => mockReturnValue);
    const wrappedOriginal = wrapMiddlewareWithSentry(origFunction);

    const mockArgs = { someProperty: 'value' };

    const result = await wrappedOriginal(mockArgs);

    expect(origFunction).toHaveBeenCalledWith(mockArgs);
    expect(result).toBe(mockReturnValue);
  });

  test('should handle errors in middleware function', async () => {
    const testError = new Error('Test middleware error');
    const origFunction: EdgeRouteHandler = vi.fn(async (..._args) => {
      throw testError;
    });
    const wrappedOriginal = wrapMiddlewareWithSentry(origFunction);

    const mockRequest = new Request('https://example.com/api/users');

    await expect(wrappedOriginal(mockRequest)).rejects.toThrow('Test middleware error');
    expect(origFunction).toHaveBeenCalledWith(mockRequest);
  });

  test('should not process tunnel route when no tunnel path is set', async () => {
    if ('_sentryRewritesTunnelPath' in globalThis) {
      delete (globalThis as any)._sentryRewritesTunnelPath;
    }

    const mockReturnValue = { status: 200 };
    const origFunction: EdgeRouteHandler = vi.fn(async (..._args) => mockReturnValue);
    const wrappedOriginal = wrapMiddlewareWithSentry(origFunction);

    const mockRequest = new Request('https://example.com/monitoring/tunnel/sentry?o=123');

    const result = await wrappedOriginal(mockRequest);

    // Should process normally since no tunnel path is configured
    expect(origFunction).toHaveBeenCalledWith(mockRequest);
    expect(result).toBe(mockReturnValue);
  });

  test('should process request when tunnel path is set but request does not match', async () => {
    (globalThis as any)._sentryRewritesTunnelPath = '/monitoring/tunnel';

    const mockReturnValue = { status: 200 };
    const origFunction: EdgeRouteHandler = vi.fn(async (..._args) => mockReturnValue);
    const wrappedOriginal = wrapMiddlewareWithSentry(origFunction);

    const mockRequest = new Request('https://example.com/api/users', { method: 'GET' });

    const result = await wrappedOriginal(mockRequest);

    // Should process normally since request doesn't match tunnel path
    expect(origFunction).toHaveBeenCalledWith(mockRequest);
    expect(result).toBe(mockReturnValue);
  });
});
