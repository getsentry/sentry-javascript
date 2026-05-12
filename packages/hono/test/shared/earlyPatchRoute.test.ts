import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPatches, earlyPatchHono } from '../../src/shared/applyPatches';
import { installRouteHookOnPrototype } from '../../src/shared/patchRoute';

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

const startSpanMock = SentryCore.startSpan as ReturnType<typeof vi.fn>;

const honoBaseProto = Object.getPrototypeOf(Hono.prototype) as { route: Function };
const originalRoute = honoBaseProto.route;

earlyPatchHono();

describe('earlyPatchHono (two-phase prototype hook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    honoBaseProto.route = originalRoute;
  });

  it('does NOT patch sub-app .request() at .route() time — only collects', async () => {
    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));

    const parent = new Hono();
    parent.route('/api', subApp);

    await subApp.request('/hello');
    expect(startSpanMock).not.toHaveBeenCalled();
  });

  it('patches collected sub-apps when applyPatches activates', async () => {
    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));

    const parent = new Hono();
    parent.route('/api', subApp);

    applyPatches(parent);

    await subApp.request('/hello');

    expect(startSpanMock).toHaveBeenCalledTimes(1);
    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'GET /hello', op: 'hono.request' }),
      expect.any(Function),
    );
  });

  it('preserves correct route behavior', async () => {
    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));

    const parent = new Hono();
    parent.route('/api', subApp);

    const res = await parent.fetch(new Request('http://localhost/api/hello'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('world');
  });
});

describe('installRouteHookOnPrototype idempotency', () => {
  afterAll(() => {
    honoBaseProto.route = originalRoute;
  });

  it('returns the same handle on repeated calls', () => {
    const handle1 = installRouteHookOnPrototype();
    const handle2 = installRouteHookOnPrototype();

    expect(handle1).toBe(handle2);
  });

  it('does not replace the patched route function on repeated calls', () => {
    installRouteHookOnPrototype();
    const patchedRoute = honoBaseProto.route;

    installRouteHookOnPrototype();
    expect(honoBaseProto.route).toBe(patchedRoute);
  });

  it('calling activate() multiple times has no adverse effect', async () => {
    const handle = installRouteHookOnPrototype();

    handle.activate();
    handle.activate();
    handle.activate();

    const app = new Hono();
    applyPatches(app);

    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));
    app.route('/api', subApp);

    await subApp.request('/hello');

    expect(startSpanMock).toHaveBeenCalledTimes(1);
  });
});
