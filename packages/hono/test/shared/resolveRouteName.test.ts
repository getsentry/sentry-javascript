import * as SentryCore from '@sentry/core';
import { applyHonoPatches, createHonoRequestMiddleware } from '@sentry/server-utils';
import { Hono } from 'hono';
import { HonoRequest } from 'hono/request';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTransactionName = vi.fn();

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn(() => undefined),
    getIsolationScope: vi.fn(() => ({
      setTransactionName: mockSetTransactionName,
      setSDKProcessingMetadata: vi.fn(),
    })),
  };
});

const getIsolationScopeMock = SentryCore.getIsolationScope as ReturnType<typeof vi.fn>;

// One isolation scope per request, as in a server. A shared scope keeps the dedup marker of the
// Sentry middleware, which then skips the next request.
function freshIsolationScope(): void {
  getIsolationScopeMock.mockReturnValue({
    setTransactionName: mockSetTransactionName,
    setSDKProcessingMetadata: vi.fn(),
  });
}

function createApp({ restoreRouteIndex }: { restoreRouteIndex: boolean }): Hono {
  const app = new Hono();
  applyHonoPatches(app);
  app.use(createHonoRequestMiddleware());

  if (restoreRouteIndex) {
    // Like Hono 5, which resets `routeIndex` after `next()` (honojs/hono#4424).
    app.use(async (c, next) => {
      const routeIndex = c.req.routeIndex;
      await next();
      c.req.routeIndex = routeIndex;
    });
  }

  app.use('/users/*', async (_c, next) => {
    await next();
  });
  // A route handler from `.use()`, which also gets a middleware span wrapper.
  app.use('/users/via-use', async c => c.text('via use'));
  app.get('/users/me', c => c.text('me'));
  app.get('/users/:id', c => c.text('user'));
  app.use('/mw-only/*', async (_c, _next) => new Response('handled by middleware'));

  const subApp = new Hono();
  subApp.get('/items/:itemId', c => c.text('item'));
  app.route('/sub', subApp);

  // A catch-all registered last. It also matches `/users/me` and `/users/42`, but never responds.
  app.get('/users/*', c => c.text('catch-all'));
  return app;
}

// Returns a function that restores the property.
function overrideRequestProperty(key: PropertyKey, descriptor: PropertyDescriptor): () => void {
  const original = Object.getOwnPropertyDescriptor(HonoRequest.prototype, key);
  Object.defineProperty(HonoRequest.prototype, key, { configurable: true, ...descriptor });
  return () => {
    if (original) {
      Object.defineProperty(HonoRequest.prototype, key, original);
    }
  };
}

const hideRequestProperty = (key: PropertyKey): (() => void) => overrideRequestProperty(key, { value: undefined });

// The symbol of the match result getter, which `hono/route` reads.
const [matchResultKey] = Object.getOwnPropertySymbols(HonoRequest.prototype);
if (!matchResultKey) {
  throw new Error('The match result getter is missing on `HonoRequest.prototype`.');
}

const SOURCES: Array<{ source: string; hidden: PropertyKey[]; restoreRouteIndex: boolean }> = [
  { source: '`c.req.matchedRoutes` (Hono 4)', hidden: [], restoreRouteIndex: false },
  // Hono 5 has no `c.req.matchedRoutes`.
  { source: 'the match result getter (Hono 5)', hidden: ['matchedRoutes'], restoreRouteIndex: true },
];

const CASES: Array<[path: string, expected: string]> = [
  ['/users/me', 'GET /users/me'],
  ['/users/42', 'GET /users/:id'],
  ['/users/via-use', 'GET /users/via-use'],
  ['/users/all/the/things', 'GET /users/*'],
  ['/sub/items/7', 'GET /sub/items/:itemId'],
  ['/mw-only/anything', 'GET /mw-only/*'],
];

describe.each(SOURCES)('route name from $source', ({ hidden, restoreRouteIndex }) => {
  let restores: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    restores = hidden.map(hideRequestProperty);
  });

  afterEach(() => {
    restores.forEach(restore => restore());
  });

  it.each(CASES)('names %s as %s', async (path, expected) => {
    freshIsolationScope();
    const app = createApp({ restoreRouteIndex });

    await app.request(path);

    expect(mockSetTransactionName).toHaveBeenLastCalledWith(expected);
  });
});

describe('route name from a match result of an unknown shape', () => {
  let restores: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    restores = [
      hideRequestProperty('matchedRoutes'),
      overrideRequestProperty(matchResultKey, { get: () => [[[null]], {}] }),
    ];
  });

  afterEach(() => {
    restores.forEach(restore => restore());
  });

  it('keeps the request working and does not name it', async () => {
    freshIsolationScope();
    const app = createApp({ restoreRouteIndex: true });

    const response = await app.request('/users/me');

    expect(response.status).toBe(200);
    expect(mockSetTransactionName).not.toHaveBeenCalled();
  });
});
