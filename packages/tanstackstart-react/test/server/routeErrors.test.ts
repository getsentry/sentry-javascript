import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentServerRouteTree } from '../../src/server/routeErrors';

const captureExceptionSpy = vi.fn();

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    captureException: (...args: unknown[]) => captureExceptionSpy(...args),
  };
});

type TestRoute = {
  options: { onError?: (error: unknown) => void };
  children?: TestRoute[] | Record<string, TestRoute>;
};

describe('instrumentServerRouteTree', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures errors passed to `onError` of every route in the tree', () => {
    const child: TestRoute = { options: {} };
    const grandChild: TestRoute = { options: {} };
    const root: TestRoute = { options: {}, children: [child, { options: {}, children: { grandChild } }] };

    instrumentServerRouteTree(root);

    const error = new Error('loader failed');
    root.options.onError?.(error);
    child.options.onError?.(error);
    grandChild.options.onError?.(error);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(3);
    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.function.tanstackstart.route', handled: false },
    });
  });

  it('does not capture errors of a route with its own `onError`', () => {
    const onError = vi.fn();
    const child: TestRoute = { options: {} };
    const root: TestRoute = { options: { onError }, children: [child] };

    instrumentServerRouteTree(root);

    const error = new Error('loader failed');
    root.options.onError?.(error);

    expect(root.options.onError).toBe(onError);
    expect(captureExceptionSpy).not.toHaveBeenCalled();

    child.options.onError?.(error);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it('wraps a route only once', () => {
    const root: TestRoute = { options: {} };

    instrumentServerRouteTree(root);
    const onError = root.options.onError;
    instrumentServerRouteTree(root);

    expect(root.options.onError).toBe(onError);
  });

  it('does not capture search and path param validation errors', () => {
    class SearchParamError extends Error {}
    class PathParamError extends Error {}
    const root: TestRoute = { options: {} };

    instrumentServerRouteTree(root);

    root.options.onError?.(new SearchParamError('invalid search'));
    root.options.onError?.(new PathParamError('invalid params'));

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'routeTree', {}])('does not throw for %s', routeTree => {
    expect(() => instrumentServerRouteTree(routeTree)).not.toThrow();
  });
});
