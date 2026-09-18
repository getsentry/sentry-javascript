import * as SentryCore from '@sentry/core';
import { applyHonoPatches as applyPatches, earlyPatchHono } from '@sentry/server-utils';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const honoBaseProto = Object.getPrototypeOf(Hono.prototype) as { route: (path: string, app: unknown) => unknown };
const originalRoute = honoBaseProto.route;

// `earlyPatchHono` installs the `HonoBase.prototype.route` hook at import time, before any
// `sentry()`/`applyHonoPatches` runs, so sub-apps mounted early are still collected.
earlyPatchHono(Hono);

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

  it('patches collected sub-apps when applyHonoPatches activates', async () => {
    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));

    const parent = new Hono();
    parent.route('/api', subApp);

    applyPatches(parent);

    await subApp.request('/hello');

    expect(startSpanMock).toHaveBeenCalledTimes(1);
    expect(startSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'GET /hello' }), expect.any(Function));
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
