import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyHonoPatches } from '@sentry/server-utils';

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

describe('patchAppUse (middleware spans)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps handlers in app.use(handler) so startInactiveSpan is called when middleware runs', async () => {
    const app = new Hono();
    applyHonoPatches(app);

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
        onlyIfParent: true,
        attributes: expect.objectContaining({
          'sentry.op': 'middleware',
          'sentry.origin': 'auto.middleware.hono',
        }),
      }),
    );
    expect(userHandler).toHaveBeenCalled();
  });

  describe('span naming', () => {
    it('uses handler.name for span when handler has a name', async () => {
      const app = new Hono();
      applyHonoPatches(app);

      async function myNamedMiddleware(_c: unknown, next: () => Promise<void>) {
        await next();
      }
      app.use(myNamedMiddleware);

      await app.fetch(new Request('http://localhost/'));

      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'myNamedMiddleware' }));
    });

    it('uses <anonymous.index> for span when handler is anonymous', async () => {
      const app = new Hono();
      applyHonoPatches(app);

      app.use(async (_c: unknown, next: () => Promise<void>) => next());

      await app.fetch(new Request('http://localhost/'));

      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      const name = startInactiveSpanMock.mock.calls[0]![0].name;
      expect(name).toMatch('<anonymous>');
    });
  });

  it('wraps each handler in app.use(path, ...handlers) and passes path through', async () => {
    const app = new Hono();
    applyHonoPatches(app);

    const handler = async (_c: unknown, next: () => Promise<void>) => next();
    app.use('/api', handler);
    app.get('/api', () => new Response('ok'));

    await app.fetch(new Request('http://localhost/api'));

    expect(startInactiveSpanMock).toHaveBeenCalled();
  });

  it('sets span error status when middleware throws a 5xx-like error', async () => {
    const app = new Hono();
    applyHonoPatches(app);

    const err = new Error('middleware error');
    app.use(async () => {
      throw err;
    });

    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(500);

    const spanFromCall = startInactiveSpanMock.mock.results[0]?.value;
    expect(spanFromCall?.setStatus).toHaveBeenCalledWith({ code: expect.any(Number), message: 'internal_error' });
  });

  it('creates sibling spans for multiple middlewares (onion order, not parent-child)', async () => {
    const app = new Hono();
    applyHonoPatches(app);

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
    expect(firstCall![0]).toMatchObject({ attributes: { 'sentry.op': 'middleware' } });
    expect(secondCall![0]).toMatchObject({ attributes: { 'sentry.op': 'middleware' } });
    expect(firstCall![0].name).toMatch('<anonymous>');
    expect(secondCall![0].name).toBe('namedMiddleware');
    expect(thirdCall![0].name).toBe('<anonymous>');
    expect(firstCall![0].name).not.toBe(secondCall![0].name);
  });

  it('does not stack proxies when called twice on the same instance', () => {
    const app = new Hono();
    applyHonoPatches(app);
    const firstUse = app.use;

    applyHonoPatches(app);
    expect(app.use).toBe(firstUse);
  });

  it('patches distinct instances independently', () => {
    const app1 = new Hono();
    const app2 = new Hono();

    applyHonoPatches(app1);
    applyHonoPatches(app2);

    expect(app1.use).not.toBe(app2.use);
  });

  it('preserves symbol-keyed and string-keyed properties on wrapped handlers', async () => {
    const app = new Hono();
    applyHonoPatches(app);

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
});

describe('patchHttpMethodHandlers (inline middleware spans on main app)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['get', 'post', 'put', 'delete', 'options', 'patch', 'all'] as const)(
    'wraps inline middleware in app.%s(path, mw, handler)',
    async method => {
      const app = new Hono();
      applyHonoPatches(app);

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
        onlyIfParent: true,
        parentSpan: undefined,
        attributes: {
          'sentry.op': 'middleware',
          'sentry.origin': 'auto.middleware.hono',
        },
      });
    },
  );

  it('does not wrap the sole handler when only one handler is passed', async () => {
    const app = new Hono();
    applyHonoPatches(app);

    app.get('/test', async function onlyHandler() {
      return new Response('ok');
    });

    await app.fetch(new Request('http://localhost/test'));

    expect(startInactiveSpanMock).not.toHaveBeenCalled();
  });

  it('wraps all handlers except the last when multiple handlers are passed', async () => {
    const app = new Hono();
    applyHonoPatches(app);

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
    applyHonoPatches(app);

    app.on(
      'QUERY',
      '/test',
      async function onMw(_c: unknown, next: () => Promise<void>) {
        await next();
      },
      async function onHandler() {
        return new Response('ok');
      },
    );

    await app.fetch(new Request('http://localhost/test', { method: 'QUERY' }));

    const spanNames = startInactiveSpanMock.mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
    expect(spanNames).toHaveLength(1);
    expect(spanNames).toContain('onMw');
    expect(spanNames).not.toContain('onHandler');
  });

  it('patches apps without app.query', () => {
    const app = new Hono();

    expect(() => applyHonoPatches(app)).not.toThrow();
  });

  it('does not wrap sole handler in app.on(method, path, handler)', async () => {
    const app = new Hono();
    applyHonoPatches(app);

    app.on('GET', '/test', async function soleHandler() {
      return new Response('ok');
    });

    await app.fetch(new Request('http://localhost/test'));

    expect(startInactiveSpanMock).not.toHaveBeenCalled();
  });

  it('does not double-wrap handlers already wrapped by patchAppUse', async () => {
    const app = new Hono();
    applyHonoPatches(app);
    applyHonoPatches(app);

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
    applyHonoPatches(app);
    const firstGet = app.get;
    const firstOn = app.on;

    applyHonoPatches(app);
    expect(app.get).toBe(firstGet);
    expect(app.on).toBe(firstOn);

    applyHonoPatches(app);
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
    applyHonoPatches(app);
    applyHonoPatches(app);

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
    applyHonoPatches(app);

    const result = app.get('/test', () => new Response('ok'));

    expect(result).toBe(app);
  });
});
