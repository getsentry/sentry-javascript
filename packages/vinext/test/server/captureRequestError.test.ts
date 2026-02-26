import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureRequestError } from '../../src/server/captureRequestError';

describe('captureRequestError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures the error with the correct context', () => {
    const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => '');
    const withScopeSpy = vi.spyOn(SentryCore, 'withScope').mockImplementation(fn => {
      const mockScope = {
        setSDKProcessingMetadata: vi.fn(),
        setContext: vi.fn(),
        setTransactionName: vi.fn(),
      };
      return fn(mockScope as any);
    });

    const error = new Error('test error');
    const request = {
      path: '/api/users',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    };
    const errorContext = {
      routerKind: 'App Router',
      routePath: '/api/users',
      routeType: 'route',
    };

    captureRequestError(error, request, errorContext);

    expect(withScopeSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: {
        handled: false,
        type: 'auto.function.vinext.on_request_error',
      },
    });
  });

  it('sets the vinext context on the scope', () => {
    vi.spyOn(SentryCore, 'captureException').mockImplementation(() => '');
    const setContextFn = vi.fn();
    vi.spyOn(SentryCore, 'withScope').mockImplementation(fn => {
      const mockScope = {
        setSDKProcessingMetadata: vi.fn(),
        setContext: setContextFn,
        setTransactionName: vi.fn(),
      };
      return fn(mockScope as any);
    });

    captureRequestError(
      new Error('test'),
      { path: '/blog/[slug]', method: 'GET', headers: {} },
      { routerKind: 'App Router', routePath: '/blog/[slug]', routeType: 'render' },
    );

    expect(setContextFn).toHaveBeenCalledWith('vinext', {
      request_path: '/blog/[slug]',
      router_kind: 'App Router',
      router_path: '/blog/[slug]',
      route_type: 'render',
    });
  });

  it('sets the transaction name from request method and route', () => {
    vi.spyOn(SentryCore, 'captureException').mockImplementation(() => '');
    const setTransactionNameFn = vi.fn();
    vi.spyOn(SentryCore, 'withScope').mockImplementation(fn => {
      const mockScope = {
        setSDKProcessingMetadata: vi.fn(),
        setContext: vi.fn(),
        setTransactionName: setTransactionNameFn,
      };
      return fn(mockScope as any);
    });

    captureRequestError(
      new Error('test'),
      { path: '/api/data', method: 'DELETE', headers: {} },
      { routerKind: 'Pages Router', routePath: '/api/data', routeType: 'route' },
    );

    expect(setTransactionNameFn).toHaveBeenCalledWith('DELETE /api/data');
  });
});
