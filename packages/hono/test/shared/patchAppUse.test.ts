import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAppUse, patchHttpMethodHandlers } from '../../src/shared/patchAppUse';

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

describe('patchAppUse (middleware spans)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const name = startInactiveSpanMock.mock.calls[0]![0].name;
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
    expect(firstCall![0]).toMatchObject({ op: 'middleware.hono' });
    expect(secondCall![0]).toMatchObject({ op: 'middleware.hono' });
    expect(firstCall![0].name).toMatch('<anonymous>');
    expect(secondCall![0].name).toBe('namedMiddleware');
    expect(thirdCall![0].name).toBe('<anonymous>');
    expect(firstCall![0].name).not.toBe(secondCall![0].name);
  });

  it('does not stack proxies when called twice on the same instance', () => {
    const app = new Hono();
    patchAppUse(app);
    const firstUse = app.use;

    patchAppUse(app);
    expect(app.use).toBe(firstUse);
  });

  it('patches distinct instances independently', () => {
    const app1 = new Hono();
    const app2 = new Hono();

    patchAppUse(app1);
    patchAppUse(app2);

    expect(app1.use).not.toBe(app2.use);
  });

  it('preserves symbol-keyed and string-keyed properties on wrapped handlers', async () => {
    const app = new Hono();
    patchAppUse(app);

    const META = Symbol('test-meta');
    const OPENAPI = Symbol('openapi');

    const handler = async (_c: unknown, next: () => Promise<void>) => next();
    (handler as any)[META] = { summary: 'Get items' };
    (handler as any)[OPENAPI] = { responses: { 200: {} } };
    (handler as any).customProp = 'hello';

    app.use('/test', handler);

    const route = (app.routes ?? []).find(r => r.path === '/test');
    expect(route).toBeDefined();

    expect((route!.handler as any).__sentry_original__).toBe(handler);

    const symbols = Object.getOwnPropertySymbols(route!.handler);
    expect(symbols).toContain(META);
    expect(symbols).toContain(OPENAPI);
    expect((route!.handler as any)[META]).toEqual({ summary: 'Get items' });
    expect((route!.handler as any)[OPENAPI]).toEqual({ responses: { 200: {} } });
    expect((route!.handler as any).customProp).toBe('hello');
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
});

describe('patchHttpMethodHandlers (inline middleware spans on main app)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['get', 'post', 'put', 'delete', 'options', 'patch', 'all'] as const)(
    'wraps inline middleware in app.%s(path, mw, handler)',
    async method => {
      const app = new Hono();
      patchHttpMethodHandlers(app);

      app[method](
        '/test',
        async function inlineMw(_c: unknown, next: () => Promise<void>) {
          await next();
        },
        () => new Response('ok'),
      );

      const fetchMethod = method === 'all' ? 'GET' : method.toUpperCase();
      await app.fetch(new Request('http://localhost/test', { method: fetchMethod }));

      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanMock).toHaveBeenCalledWith({
        name: 'inlineMw',
        op: 'middleware.hono',
        onlyIfParent: true,
        parentSpan: undefined,
        attributes: {
          'sentry.op': 'middleware.hono',
          'sentry.origin': 'auto.middleware.hono',
        },
      });
    },
  );

  it('does not wrap the sole handler when only one handler is passed', async () => {
    const app = new Hono();
    patchHttpMethodHandlers(app);

    app.get('/test', async function onlyHandler() {
      return new Response('ok');
    });

    await app.fetch(new Request('http://localhost/test'));

    expect(startInactiveSpanMock).not.toHaveBeenCalled();
  });

  it('wraps all handlers except the last when multiple handlers are passed', async () => {
    const app = new Hono();
    patchHttpMethodHandlers(app);

    app.get(
      '/test',
      async function mw1(_c: unknown, next: () => Promise<void>) {
        await next();
      },
      async function mw2(_c: unknown, next: () => Promise<void>) {
        await next();
      },
      async function routeHandler() {
        return new Response('ok');
      },
    );

    await app.fetch(new Request('http://localhost/test'));

    const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
    expect(spanNames).toHaveLength(2);
    expect(spanNames).toContain('mw1');
    expect(spanNames).toContain('mw2');
    expect(spanNames).not.toContain('routeHandler');
  });

  it('wraps inline middleware in app.on(method, path, mw, handler)', async () => {
    const app = new Hono();
    patchHttpMethodHandlers(app);

    app.on(
      'GET',
      '/test',
      async function onMw(_c: unknown, next: () => Promise<void>) {
        await next();
      },
      async function onHandler() {
        return new Response('ok');
      },
    );

    await app.fetch(new Request('http://localhost/test'));

    const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
    expect(spanNames).toHaveLength(1);
    expect(spanNames).toContain('onMw');
    expect(spanNames).not.toContain('onHandler');
  });

  it('does not wrap sole handler in app.on(method, path, handler)', async () => {
    const app = new Hono();
    patchHttpMethodHandlers(app);

    app.on('GET', '/test', async function soleHandler() {
      return new Response('ok');
    });

    await app.fetch(new Request('http://localhost/test'));

    expect(startInactiveSpanMock).not.toHaveBeenCalled();
  });

  it('does not double-wrap handlers already wrapped by patchAppUse', async () => {
    const app = new Hono();
    patchAppUse(app);
    patchHttpMethodHandlers(app);

    app.use(async function useMw(_c: unknown, next: () => Promise<void>) {
      await next();
    });
    app.get('/test', () => new Response('ok'));

    await app.fetch(new Request('http://localhost/test'));

    expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
    expect((startInactiveSpanMock.mock.calls[0]![0] as { name: string }).name).toBe('useMw');
  });

  it('produces exactly one span per middleware and does not stack Proxy layers when called multiple times on the same instance', async () => {
    const app = new Hono();
    patchHttpMethodHandlers(app);
    const firstGet = app.get;
    const firstOn = app.on;

    patchHttpMethodHandlers(app);
    expect(app.get).toBe(firstGet);
    expect(app.on).toBe(firstOn);

    patchHttpMethodHandlers(app);
    expect(app.get).toBe(firstGet);
    expect(app.on).toBe(firstOn);

    app.get(
      '/test',
      async function inlineMw(_c: unknown, next: () => Promise<void>) {
        await next();
      },
      async function routeHandler() {
        return new Response('ok');
      },
    );

    await app.fetch(new Request('http://localhost/test'));

    const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
    expect(spanNames).toHaveLength(1);
    expect(spanNames[0]).toBe('inlineMw');
  });

  it('creates spans for both app.use middleware and inline middleware in app.get', async () => {
    const app = new Hono();
    patchAppUse(app);
    patchHttpMethodHandlers(app);

    app.use('/test', async function globalMw(_c: unknown, next: () => Promise<void>) {
      await next();
    });
    app.get(
      '/test',
      async function inlineMw(_c: unknown, next: () => Promise<void>) {
        await next();
      },
      () => new Response('ok'),
    );

    await app.fetch(new Request('http://localhost/test'));

    const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
    expect(spanNames).toContain('globalMw');
    expect(spanNames).toContain('inlineMw');
    expect(spanNames).toHaveLength(2);
  });

  it('preserves return value and chaining', () => {
    const app = new Hono();
    patchHttpMethodHandlers(app);

    const result = app.get('/test', () => new Response('ok'));

    expect(result).toBe(app);
  });

  it('forwards thisArg to the original method', () => {
    let capturedThis: unknown = null;
    const fakeMethod = function (this: unknown) {
      // oxlint-disable-next-line @typescript-eslint/no-this-alias
      capturedThis = this;
      return this;
    };
    const fakeApp = {
      get: fakeMethod,
      post: fakeMethod,
      put: fakeMethod,
      delete: fakeMethod,
      options: fakeMethod,
      patch: fakeMethod,
      all: fakeMethod,
      on: fakeMethod,
    };

    patchHttpMethodHandlers(fakeApp as unknown as Parameters<typeof patchHttpMethodHandlers>[0]);

    // @ts-expect-error - we're only testing that thisArg is forwarded, so the args don't need to be correct
    fakeApp.get('/test', () => new Response('ok'));

    expect(capturedThis).toBe(fakeApp);
  });
});
