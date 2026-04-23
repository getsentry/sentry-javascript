import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAppUse } from '../../src/shared/patchAppUse';
import { patchRoute } from '../../src/shared/patchRoute';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: vi.fn((_opts: unknown) => ({
      setStatus: vi.fn(),
      end: vi.fn(),
    })),
    captureException: vi.fn(),
  };
});

const startInactiveSpanMock = SentryCore.startInactiveSpan as ReturnType<typeof vi.fn>;
const captureExceptionMock = SentryCore.captureException as ReturnType<typeof vi.fn>;

const honoBaseProto = Object.getPrototypeOf(Object.getPrototypeOf(new Hono()));
const originalRoute = honoBaseProto.route;

describe('patchAppUse (middleware spans)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    honoBaseProto.route = originalRoute;
  });

  it('wraps handlers in app.use(handler) so startInactiveSpan is called when middleware runs', async () => {
    const app = new Hono();
    patchAppUse(app);

    const userHandler = vi.fn(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    });
    app.use(userHandler);

    expect(startInactiveSpanMock).not.toHaveBeenCalled();

    const fetchHandler = app.fetch;
    const req = new Request('http://localhost/');
    await fetchHandler(req);

    expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
    expect(startInactiveSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'middleware.hono',
        onlyIfParent: true,
        attributes: expect.objectContaining({
          'sentry.op': 'middleware.hono',
          'sentry.origin': 'auto.middleware.hono',
        }),
      }),
    );
    expect(userHandler).toHaveBeenCalled();
  });

  describe('span naming', () => {
    it('uses handler.name for span when handler has a name', async () => {
      const app = new Hono();
      patchAppUse(app);

      async function myNamedMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      }
      app.use(myNamedMiddleware);

      await app.fetch(new Request('http://localhost/'));

      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'myNamedMiddleware' }));
    });

    it('uses <anonymous.index> for span when handler is anonymous', async () => {
      const app = new Hono();
      patchAppUse(app);

      app.use(async (_c: unknown, next: () => Promise<void>) => next());

      await app.fetch(new Request('http://localhost/'));

      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      const name = startInactiveSpanMock.mock.calls[0][0].name;
      expect(name).toMatch('<anonymous>');
    });
  });

  it('wraps each handler in app.use(path, ...handlers) and passes path through', async () => {
    const app = new Hono();
    patchAppUse(app);

    const handler = async (_c: unknown, next: () => Promise<void>) => next();
    app.use('/api', handler);
    app.get('/api', () => new Response('ok'));

    await app.fetch(new Request('http://localhost/api'));

    expect(startInactiveSpanMock).toHaveBeenCalled();
  });

  it('calls captureException when middleware throws', async () => {
    const app = new Hono();
    patchAppUse(app);

    const err = new Error('middleware error');
    app.use(async () => {
      throw err;
    });

    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(500);

    expect(captureExceptionMock).toHaveBeenCalledWith(err, {
      mechanism: { handled: false, type: 'auto.middleware.hono' },
    });
  });

  it('creates sibling spans for multiple middlewares (onion order, not parent-child)', async () => {
    const app = new Hono();
    patchAppUse(app);

    app.use(
      async (_c: unknown, next: () => Promise<void>) => next(),
      async function namedMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      },
      async (_c: unknown, next: () => Promise<void>) => next(),
    );

    await app.fetch(new Request('http://localhost/'));

    expect(startInactiveSpanMock).toHaveBeenCalledTimes(3);
    const [firstCall, secondCall, thirdCall] = startInactiveSpanMock.mock.calls;
    expect(firstCall[0]).toMatchObject({ op: 'middleware.hono' });
    expect(secondCall[0]).toMatchObject({ op: 'middleware.hono' });
    expect(firstCall[0].name).toMatch('<anonymous>');
    expect(secondCall[0].name).toBe('namedMiddleware');
    expect(thirdCall[0].name).toBe('<anonymous>');
    expect(firstCall[0].name).not.toBe(secondCall[0].name);
  });

  it('preserves this context when calling the original use (Proxy forwards thisArg)', () => {
    type FakeApp = {
      _capturedThis: unknown;
      use: (...args: unknown[]) => FakeApp;
    };
    const fakeApp: FakeApp = {
      _capturedThis: null,
      use(this: FakeApp, ..._args: unknown[]) {
        this._capturedThis = this;
        return this;
      },
    };

    patchAppUse(fakeApp as unknown as Parameters<typeof patchAppUse>[0]);

    const noop = async (_c: unknown, next: () => Promise<void>) => next();
    fakeApp.use(noop);

    expect(fakeApp._capturedThis).toBe(fakeApp);
  });

  describe('route() patching (sub-app / route group support)', () => {
    beforeEach(() => {
      honoBaseProto.route = originalRoute;
    });

    it('wraps middleware on sub-apps mounted via route()', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

      const subApp = new Hono();
      subApp.use(async function subMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/', () => new Response('sub'));

      app.route('/sub', subApp);

      await app.fetch(new Request('http://localhost/sub'));

      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'subMiddleware' }));
    });

    it('does not wrap route handlers (only method ALL from use())', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

      const subApp = new Hono();
      subApp.get('/', () => new Response('sub'));

      app.route('/sub', subApp);

      await app.fetch(new Request('http://localhost/sub'));

      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('does not double-wrap handlers already wrapped by patchAppUse on the main app', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

      app.use(async function mainMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      app.get('/', () => new Response('ok'));

      // Mount the main app as a sub-app of another app (contrived but tests the guard)
      const parent = new Hono();
      parent.route('/', app);

      await parent.fetch(new Request('http://localhost/'));

      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'mainMiddleware' }));
    });

    it('does not patch route() twice when patchRoute is called multiple times', () => {
      const app1 = new Hono();
      patchRoute(app1);

      const patchedRoute = honoBaseProto.route;

      const app2 = new Hono();
      patchRoute(app2);

      expect(honoBaseProto.route).toBe(patchedRoute);
    });

    it('stores the original route via __sentry_original__ for other libraries to unwrap', () => {
      const app = new Hono();
      patchRoute(app);

      // oxlint-disable-next-line typescript/no-explicit-any
      const sentryOriginal = (honoBaseProto.route as any).__sentry_original__;
      expect(sentryOriginal).toBe(originalRoute);
    });

    it('wraps path-targeted .use("/path", handler) on sub-apps', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

      const subApp = new Hono();
      subApp.use('/admin/*', async function adminAuth(_c: unknown, next: () => Promise<void>) {
        await next();
      });
      subApp.get('/admin/dashboard', () => new Response('dashboard'));

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/admin/dashboard'));

      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'adminAuth' }));
    });

    it('also wraps .all() handlers on sub-apps (same method: ALL in route record)', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

      const subApp = new Hono();
      subApp.all('/catch-all', async function allHandler() {
        return new Response('catch-all');
      });

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/catch-all'));

      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'allHandler' }));
    });

    it('wraps mixed .use() and .all() handlers on the same sub-app', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

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
      expect(spanNames).toContain('allRoute');
    });

    it('does not wrap .get()/.post()/.put()/.delete() handlers on sub-apps', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

      const subApp = new Hono();
      subApp.get('/resource', async function getHandler() {
        return new Response('get');
      });
      subApp.post('/resource', async function postHandler() {
        return new Response('post');
      });

      app.route('/api', subApp);
      await app.fetch(new Request('http://localhost/api/resource'));

      expect(startInactiveSpanMock).not.toHaveBeenCalled();
    });

    it('wraps middleware in nested sub-apps (sub-app mounting another sub-app)', async () => {
      const app = new Hono();
      patchAppUse(app);
      patchRoute(app);

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
      patchAppUse(app);
      patchRoute(app);

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

      // Hit path /a — only mwForA should fire
      await app.fetch(new Request('http://localhost/sub/a/test'));
      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'mwForA' }));

      startInactiveSpanMock.mockClear();

      // Hit path /b — only mwForB should fire
      await app.fetch(new Request('http://localhost/sub/b/test'));
      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'mwForB' }));
    });
  });
});
