import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPatches } from '../../src/shared/applyPatches';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: vi.fn((_opts: unknown) => ({
      setStatus: vi.fn(),
      end: vi.fn(),
    })),
    startSpan: vi.fn((_opts: unknown, callback: () => unknown) => callback()),
    getActiveSpan: vi.fn(() => ({ spanId: 'fake-span' })),
  };
});

const startInactiveSpanMock = SentryCore.startInactiveSpan as ReturnType<typeof vi.fn>;
const startSpanMock = SentryCore.startSpan as ReturnType<typeof vi.fn>;

const honoBaseProto = Object.getPrototypeOf(Object.getPrototypeOf(new Hono()));
const originalRoute = honoBaseProto.route;

describe('applyPatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    honoBaseProto.route = originalRoute;
  });

  afterAll(() => {
    honoBaseProto.route = originalRoute;
  });

  describe('wrapSubAppMiddleware', () => {
    it('does nothing when a sub-app has an empty routes array', async () => {
      const app = new Hono();
      applyPatches(app);

      const emptySubApp = new Hono();
      app.route('/empty', emptySubApp);

      const res = await app.fetch(new Request('http://localhost/empty'));
      expect(res.status).toBe(404);
      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('skips route entries whose handler is not a function', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.get('/resource', () => new Response('ok'));

      (subApp.routes as unknown as Array<{ handler: unknown }>)[0]!.handler = 'not-a-function';

      expect(() => app.route('/api', subApp)).not.toThrow();
      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('treats same path with different HTTP methods as separate groups', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
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
      applyPatches(app);

      const subApp = new Hono();
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
      applyPatches(app);

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

  describe('route() patching', () => {
    it('wraps middleware on sub-apps mounted via route()', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.use(async function subMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/', () => new Response('sub'));

      app.route('/sub', subApp);

      await app.fetch(new Request('http://localhost/sub'));

      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'subMiddleware' }));
    });

    it('does not wrap sole route handlers on sub-apps', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.get('/', () => new Response('sub'));

      app.route('/sub', subApp);

      await app.fetch(new Request('http://localhost/sub'));

      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('does not double-wrap handlers already wrapped by patchAppUse on the main app', async () => {
      const app = new Hono();
      applyPatches(app);

      app.use(async function mainMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      app.get('/', () => new Response('ok'));

      const parent = new Hono();
      parent.route('/', app);

      await parent.fetch(new Request('http://localhost/'));

      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'mainMiddleware' }));
    });

    it('does not patch route() twice when applyPatches is called multiple times', () => {
      const app1 = new Hono();
      applyPatches(app1);

      const patchedRoute = honoBaseProto.route;

      const app2 = new Hono();
      applyPatches(app2);

      expect(honoBaseProto.route).toBe(patchedRoute);
    });

    it('stores the original route via __sentry_original__ for other libraries to unwrap', () => {
      const app = new Hono();
      applyPatches(app);

      // oxlint-disable-next-line typescript/no-explicit-any
      const sentryOriginal = (honoBaseProto.route as any).__sentry_original__;
      expect(sentryOriginal).toBe(originalRoute);
    });

    it('wraps path-targeted .use("/path", handler) on sub-apps', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.use('/admin/*', async function adminAuth(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/admin/dashboard', () => new Response('dashboard'));

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/admin/dashboard'));

      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'adminAuth' }));
    });

    it('does not wrap .all() handlers with less than 2 params (they are route handlers, not middleware)', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.all('/catch-all', async function allHandler() {
        return new Response('catch-all');
      });

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/catch-all'));

      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('wraps .use() middleware but not .all() handlers on the same sub-app', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.use(async function mw(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.all('/wildcard', async function allRoute() {
        return new Response('wildcard');
      });
      subApp.get('/specific', () => new Response('specific'));

      app.route('/mixed', subApp);
      await app.fetch(new Request('http://localhost/mixed/wildcard'));

      const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
      expect(spanNames).toContain('mw');
      expect(spanNames).not.toContain('allRoute');
    });

    it('does not wrap sole .get()/.post()/.put()/.delete() handlers on sub-apps', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.get('/resource', async function getHandler() {
        return new Response('get');
      });
      subApp.post('/resource', async function postHandler() {
        return new Response('post');
      });
      subApp.put('/resource', async function postHandler() {
        return new Response('put');
      });
      subApp.delete('/resource', async function postHandler() {
        return new Response('delete');
      });

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/resource'));

      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('wraps inline middleware in .get(path, mw, handler) on sub-apps', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.get(
        '/resource',
        async function inlineMw(_c: unknown, next: () => Promise<void>) {
          await next();
        },
        async function getHandler() {
          return new Response('get');
        },
      );

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/resource'));

      const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
      expect(spanNames).toContain('inlineMw');
      expect(spanNames).not.toContain('getHandler');
    });

    it('wraps separately registered middleware for .get() on sub-apps', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.get('/resource', async function separateMw(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/resource', async function getHandler() {
        return new Response('get');
      });

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/resource'));

      const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
      expect(spanNames).toContain('separateMw');
      expect(spanNames).not.toContain('getHandler');
    });

    it('wraps inline middleware registered via .on() on sub-apps', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.on(
        'GET',
        '/resource',
        async function onMw(_c: unknown, next: () => Promise<void>) {
          await next();
        },
        async function onHandler() {
          return new Response('on');
        },
      );

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/resource'));

      const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
      expect(spanNames).toContain('onMw');
      expect(spanNames).not.toContain('onHandler');
    });

    it('wraps middleware in nested sub-apps (sub-app mounting another sub-app)', async () => {
      const app = new Hono();
      applyPatches(app);

      const innerSub = new Hono();
      innerSub.use(async function innerMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      innerSub.get('/', () => new Response('inner'));

      const outerSub = new Hono();
      outerSub.use(async function outerMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      outerSub.route('/inner', innerSub);

      app.route('/outer', outerSub);
      await app.fetch(new Request('http://localhost/outer/inner'));

      const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
      expect(spanNames).toContain('outerMiddleware');
      expect(spanNames).toContain('innerMiddleware');
    });

    it('handles sub-app with multiple path-targeted middleware for different paths', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.use('/a/*', async function mwForA(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.use('/b/*', async function mwForB(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/a/test', () => new Response('a'));
      subApp.get('/b/test', () => new Response('b'));

      app.route('/sub', subApp);

      await app.fetch(new Request('http://localhost/sub/a/test'));
      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'mwForA' }));

      startInactiveSpanMock.mockClear();

      await app.fetch(new Request('http://localhost/sub/b/test'));
      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'mwForB' }));
    });
  });

  describe('wrapSubAppMiddleware non-invasive patching', () => {
    it('preserves symbol-keyed properties on sub-app middleware handlers', async () => {
      const app = new Hono();
      applyPatches(app);

      const OPENAPI = Symbol('openapi');
      const META = Symbol('meta');
      const middleware = async function authMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      };
      (middleware as any)[OPENAPI] = { security: [{ bearer: [] }] };
      (middleware as any)[META] = { rateLimit: 100 };
      (middleware as any).customProp = 'preserved';

      const subApp = new Hono();
      subApp.use(middleware);
      subApp.get('/', () => new Response('ok'));

      app.route('/api', subApp);

      const route = (subApp.routes as Array<{ handler: Function }>).find(
        r => (r.handler as any).__sentry_original__ === middleware || r.handler === middleware,
      );
      expect(route).toBeDefined();

      const wrappedHandler = route!.handler;
      const symbols = Object.getOwnPropertySymbols(wrappedHandler);
      expect(symbols).toContain(OPENAPI);
      expect(symbols).toContain(META);
      expect((wrappedHandler as any)[OPENAPI]).toEqual({ security: [{ bearer: [] }] });
      expect((wrappedHandler as any)[META]).toEqual({ rateLimit: 100 });
      expect((wrappedHandler as any).customProp).toBe('preserved');
    });

    it('preserves function.name on sub-app middleware after wrapping', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.use(async function corsMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/', () => new Response('ok'));

      app.route('/api', subApp);

      const route = (subApp.routes as Array<{ handler: Function; method: string }>).find(
        r => r.method === 'ALL' && r.handler.name === 'corsMiddleware',
      );
      expect(route).toBeDefined();
      expect(route!.handler.name).toBe('corsMiddleware');
    });

    it('preserves function.length on sub-app middleware after wrapping', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      const mw = async function twoArgMw(_c: unknown, next: () => Promise<void>) {
        await next();
      };
      const originalLength = mw.length;
      subApp.use(mw);
      subApp.get('/', () => new Response('ok'));

      app.route('/api', subApp);

      const route = (subApp.routes as Array<{ handler: Function; method: string }>).find(
        r => r.method === 'ALL' && r.handler.length === originalLength,
      );
      expect(route).toBeDefined();
      expect(route!.handler.length).toBe(originalLength);
    });

    it('does not alter the behavior of sub-app route handlers (non-middleware)', async () => {
      const app = new Hono();
      applyPatches(app);

      const HANDLER_META = Symbol('handler-meta');
      const handler = async function getItems() {
        return new Response('items');
      };
      (handler as any)[HANDLER_META] = { cached: true };

      const subApp = new Hono();
      subApp.get('/items', handler);

      app.route('/api', subApp);

      const route = (subApp.routes as Array<{ handler: Function; path: string }>).find(r => r.path === '/items');
      expect(route).toBeDefined();
      expect((route!.handler as any)[HANDLER_META]).toEqual({ cached: true });

      const res = await app.fetch(new Request('http://localhost/api/items'));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('items');
    });
  });

  describe('main-app .get() routes after applyPatches', () => {
    it('responds correctly from .get() routes registered after applyPatches', async () => {
      const app = new Hono();
      applyPatches(app);

      app.get('/docs', c => c.text('API Documentation'));
      app.get('/openapi.json', c => c.json({ openapi: '3.0.0', paths: {} }));

      const docsRes = await app.fetch(new Request('http://localhost/docs'));
      expect(docsRes.status).toBe(200);
      expect(await docsRes.text()).toBe('API Documentation');

      const specRes = await app.fetch(new Request('http://localhost/openapi.json'));
      expect(specRes.status).toBe(200);
      expect(await specRes.json()).toEqual({ openapi: '3.0.0', paths: {} });
    });

    it('preserves .get() routes registered after .basePath() and .route() chains', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.use(async function authMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/resource', () => new Response('resource'));

      app.basePath('/api').route('/v1', subApp);

      app.get('/docs', c => c.text('Docs page'));
      app.get('/openapi.json', c => c.json({ openapi: '3.0.0' }));

      const resourceRes = await app.fetch(new Request('http://localhost/api/v1/resource'));
      expect(resourceRes.status).toBe(200);
      expect(await resourceRes.text()).toBe('resource');

      const docsRes = await app.fetch(new Request('http://localhost/docs'));
      expect(docsRes.status).toBe(200);
      expect(await docsRes.text()).toBe('Docs page');

      const specRes = await app.fetch(new Request('http://localhost/openapi.json'));
      expect(specRes.status).toBe(200);
      expect(await specRes.json()).toEqual({ openapi: '3.0.0' });
    });

    it('does not corrupt app.routes for third-party route introspection', () => {
      const app = new Hono();
      applyPatches(app);

      app.use(async function globalMw(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      app.get('/users', () => new Response('users'));
      app.post('/users', () => new Response('created'));

      const subApp = new Hono();
      subApp.get('/items', () => new Response('items'));
      app.route('/api', subApp);

      const routes = app.routes as Array<{ method: string; path: string; handler: Function }>;
      const getPaths = routes.filter(r => r.method === 'GET').map(r => r.path);
      const postPaths = routes.filter(r => r.method === 'POST').map(r => r.path);

      expect(getPaths).toContain('/users');
      expect(getPaths).toContain('/api/items');
      expect(postPaths).toContain('/users');

      for (const route of routes) {
        expect(typeof route.handler).toBe('function');
      }
    });
  });

  describe('patchAppRequest integration', () => {
    it('patches .request() on sub-apps when they are mounted via route()', async () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.get('/hello', () => new Response('world'));

      app.route('/api', subApp);

      await subApp.request('/hello');

      expect(startSpanMock).toHaveBeenCalledTimes(1);
      expect(startSpanMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'GET /hello',
          op: 'hono.request',
          attributes: expect.objectContaining({
            'sentry.op': 'hono.request',
            'sentry.origin': 'auto.http.hono.internal_request',
          }),
        }),
        expect.any(Function),
      );
    });

    it('does not double-patch .request() on a sub-app mounted multiple times', () => {
      const app = new Hono();
      applyPatches(app);

      const subApp = new Hono();
      subApp.get('/hello', () => new Response('world'));

      app.route('/api', subApp);
      const patchedRequest = subApp.request;

      app.route('/api2', subApp);
      expect(subApp.request).toBe(patchedRequest);
    });
  });
});
