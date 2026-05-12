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
