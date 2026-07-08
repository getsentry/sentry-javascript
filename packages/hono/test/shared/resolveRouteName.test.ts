import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMatchedRoutes = vi.fn();
const mockRoutePath = vi.fn();

vi.mock('hono/route', () => ({
  matchedRoutes: (c: unknown) => mockMatchedRoutes(c),
  routePath: (c: unknown, index?: number) => mockRoutePath(c, index),
}));

import { resolveRouteName } from '../../src/shared/resolveRouteName';

type Route = {
  basePath: string;
  path: string;
  method: string;
  handler: (...args: unknown[]) => unknown;
};

// Middleware has the signature `(context, next)` → arity 2
// Route handlers are `(context)` → arity (no. of args) 1
// `resolveRouteName` relies on this arity difference to tell them apart.
function mw(path: string, method = 'ALL'): Route {
  return { basePath: '/', path, method, handler: (_c: unknown, _next: unknown) => undefined };
}

function handler(path: string, method = 'GET'): Route {
  return { basePath: '/', path, method, handler: (_c: unknown) => undefined };
}

function ctx(routeIndex: number): Context {
  return { req: { method: 'GET', routeIndex } } as unknown as Context;
}

describe('resolveRouteName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoutePath.mockReturnValue('/fallback');
  });

  it('returns the handler path when routeIndex points at a handler (normal flow)', () => {
    mockMatchedRoutes.mockReturnValue([mw('/*'), handler('/users/:id')]);

    expect(resolveRouteName(ctx(1))).toBe('/users/:id');
  });

  it('ignores a trailing catch-all middleware and uses the handler path', () => {
    // app.use(fn) registered after the handlers → trailing `/*` is the last matched entry.
    mockMatchedRoutes.mockReturnValue([mw('/*'), handler('/test-routes'), mw('/*')]);

    expect(resolveRouteName(ctx(1))).toBe('/test-routes');
  });

  it('resolves the handler before dispatch when routeIndex still points at the sentry middleware', () => {
    // Provisional pass: routeIndex is 0 (the sentry middleware) and `matchedRoutes` is already populated.
    mockMatchedRoutes.mockReturnValue([mw('/*'), handler('/test-routes'), mw('/*')]);

    expect(resolveRouteName(ctx(0))).toBe('/test-routes');
  });

  it('falls back to the matched handler when a middleware short-circuits (routeIndex on middleware)', () => {
    // A scoped middleware throws before reaching the handler, so routeIndex stays on the middleware.
    mockMatchedRoutes.mockReturnValue([mw('/*'), mw('/test/middleware/*'), handler('/test/middleware'), mw('/*')]);

    expect(resolveRouteName(ctx(1))).toBe('/test/middleware');
  });

  it('prefers the responding handler over other matched handlers (overlap)', () => {
    // Both `/users/:id` and a `/*` catch-all handler match; routeIndex disambiguates.
    mockMatchedRoutes.mockReturnValue([mw('/*'), handler('/users/:id'), handler('/*')]);

    expect(resolveRouteName(ctx(1))).toBe('/users/:id');
  });

  it('detects a sub-app handler wrapped by a custom onError (COMPOSED_HANDLER)', () => {
    // Hono wraps the handler in an arity-2 closure but exposes the original via `__COMPOSED_HANDLER`.
    const wrapped = ((_c: unknown, _next: unknown) => undefined) as Route['handler'];
    (wrapped as unknown as Record<string, unknown>).__COMPOSED_HANDLER = (_c: unknown) => undefined;

    mockMatchedRoutes.mockReturnValue([
      mw('/*'),
      { basePath: '/', path: '/test/custom-on-error/fail', method: 'GET', handler: wrapped },
      mw('/*'),
    ]);

    expect(resolveRouteName(ctx(1))).toBe('/test/custom-on-error/fail');
  });

  it('falls back to routePath(c, -1) when only middleware matched', () => {
    const context = ctx(1);
    mockMatchedRoutes.mockReturnValue([mw('/*'), mw('/test-basepath/v1/*')]);
    mockRoutePath.mockReturnValue('/test-basepath/v1/*');

    expect(resolveRouteName(context)).toBe('/test-basepath/v1/*');
    expect(mockRoutePath).toHaveBeenCalledWith(context, -1);
  });

  it('falls back to routePath(c, -1) when no routes matched', () => {
    const context = ctx(0);
    mockMatchedRoutes.mockReturnValue([]);
    mockRoutePath.mockReturnValue('');

    expect(resolveRouteName(context)).toBe('');
    expect(mockRoutePath).toHaveBeenCalledWith(context, -1);
  });

  it('walks back to the last handler when routeIndex is out of range', () => {
    mockMatchedRoutes.mockReturnValue([mw('/*'), handler('/test-late-get')]);

    expect(resolveRouteName(ctx(5))).toBe('/test-late-get');
  });
});
