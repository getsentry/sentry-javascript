import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchRoute } from '../../src/shared/patchRoute';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: vi.fn((_opts: unknown) => ({
      setStatus: vi.fn(),
      end: vi.fn(),
    })),
  };
});

const startInactiveSpanMock = SentryCore.startInactiveSpan as ReturnType<typeof vi.fn>;

const honoBaseProto = Object.getPrototypeOf(Object.getPrototypeOf(new Hono()));
const originalRoute = honoBaseProto.route;

describe('patchRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    honoBaseProto.route = originalRoute;
  });

  afterAll(() => {
    honoBaseProto.route = originalRoute;
  });

  it('is a no-op when honoBaseProto.route is not a function', () => {
    const fakeApp = Object.create({ notRoute: () => {} }) as Hono;
    // Should not throw even when the expected method shape is missing
    expect(() => patchRoute(fakeApp)).not.toThrow();
    expect(honoBaseProto.route).toBe(originalRoute);
  });

  describe('wrapSubAppMiddleware', () => {
    it('does nothing when a sub-app has an empty routes array', async () => {
      const app = new Hono();
      patchRoute(app);

      const emptySubApp = new Hono();
      // routes is an empty array — nothing to wrap, nothing should throw
      app.route('/empty', emptySubApp);

      const res = await app.fetch(new Request('http://localhost/empty'));
      expect(res.status).toBe(404);
      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('skips route entries whose handler is not a function', async () => {
      const app = new Hono();
      patchRoute(app);

      const subApp = new Hono();
      subApp.get('/resource', () => new Response('ok'));

      // Corrupt one handler to a non-function to simulate unexpected route shapes
      (subApp.routes as unknown as Array<{ handler: unknown }>)[0]!.handler = 'not-a-function';

      // Should not throw when iterating over the corrupted routes
      expect(() => app.route('/api', subApp)).not.toThrow();
      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('treats same path with different HTTP methods as separate groups', async () => {
      const app = new Hono();
      patchRoute(app);

      const subApp = new Hono();
      // Each of these is the sole (last) handler for its method+path group,
      // so none should be wrapped as middleware.
      subApp.get('/resource', async function getHandler() {
        return new Response('get');
      });
      subApp.post('/resource', async function postHandler() {
        return new Response('post');
      });

      app.route('/api', subApp);

      await app.fetch(new Request('http://localhost/api/resource', { method: 'GET' }));
      await app.fetch(new Request('http://localhost/api/resource', { method: 'POST' }));

      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('treats same HTTP method with different paths as separate groups', async () => {
      const app = new Hono();
      patchRoute(app);

      const subApp = new Hono();
      // Each is the sole handler for its own method+path group — neither is middleware.
      subApp.get('/alpha', async function alphaHandler() {
        return new Response('alpha');
      });
      subApp.get('/beta', async function betaHandler() {
        return new Response('beta');
      });

      app.route('/api', subApp);

      await app.fetch(new Request('http://localhost/api/alpha'));
      await app.fetch(new Request('http://localhost/api/beta'));

      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('wraps inline middleware for GET /alpha but not the sole handler for GET /beta', async () => {
      const app = new Hono();
      patchRoute(app);

      const subApp = new Hono();
      subApp.get(
        '/alpha',
        async function alphaMw(_c: unknown, next: () => Promise<void>) {
          await next();
        },
        async function alphaHandler() {
          return new Response('alpha');
        },
      );
      subApp.get('/beta', async function betaHandler() {
        return new Response('beta');
      });

      app.route('/api', subApp);

      await app.fetch(new Request('http://localhost/api/alpha'));
      await app.fetch(new Request('http://localhost/api/beta'));

      const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
      expect(spanNames).toHaveLength(1);
      expect(spanNames).toContain('alphaMw');
      expect(spanNames).not.toContain('alphaHandler');
      expect(spanNames).not.toContain('betaHandler');
    });
  });
});
