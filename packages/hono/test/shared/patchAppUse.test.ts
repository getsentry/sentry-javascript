import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAppUse } from '../../src/shared/patchAppUse';

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

      app.use(async (_c: unknown, next: () => Promise<void>) => await next());

      await app.fetch(new Request('http://localhost/'));

      expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
      const name = startInactiveSpanMock.mock.calls[0][0].name;
      expect(name).toMatch(/^<anonymous\.\d+>$/);
    });
  });

  it('wraps each handler in app.use(path, ...handlers) and passes path through', async () => {
    const app = new Hono();
    patchAppUse(app);

    const handler = async (_c: unknown, next: () => Promise<void>) => await next();
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
      async (_c: unknown, next: () => Promise<void>) => next(),
    );

    await app.fetch(new Request('http://localhost/'));

    expect(startInactiveSpanMock).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = startInactiveSpanMock.mock.calls;
    expect(firstCall[0]).toMatchObject({ op: 'middleware.hono' });
    expect(secondCall[0]).toMatchObject({ op: 'middleware.hono' });
    expect(firstCall[0].name).toMatch(/^<anonymous\.\d+>$/);
    expect(secondCall[0].name).toMatch(/^<anonymous\.\d+>$/);
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
});
