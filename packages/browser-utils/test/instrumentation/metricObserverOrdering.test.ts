import { afterEach, describe, expect, it, vi } from 'vitest';

// The web vital observers are shared: whoever registers the first handler used to create them, which
// froze web-vitals' options for every other consumer. Replay registers its handlers from its own
// `afterAllSetup`, so ordering it before `browserTracingIntegration` used to pin the observers to
// `reportSoftNavs: false` and silently drop soft navigation vitals.
describe('metric observer instrumentation ordering', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('web-vitals');
  });

  async function loadWithSpies() {
    const onCLS = vi.fn();
    vi.doMock('web-vitals', () => ({
      onCLS,
      onLCP: vi.fn(),
      onINP: vi.fn(),
      onTTFB: vi.fn(),
      onFCP: vi.fn(),
    }));
    return { onCLS, mod: await import('../../src/instrumentation/performanceObserver') };
  }

  // Both orders have to reach web-vitals with the same options; only the settling is awaited.
  const settled = () => new Promise(resolve => setTimeout(resolve, 0));

  it('reports soft navigations when enabled before any handler is added', async () => {
    const { onCLS, mod } = await loadWithSpies();

    mod.enableSoftNavigationReporting();
    mod.addClsInstrumentationHandler(() => {});
    await settled();

    expect(onCLS).toHaveBeenCalledWith(expect.any(Function), { reportAllChanges: false, reportSoftNavs: true });
  });

  it('reports soft navigations when enabled after a handler is already added', async () => {
    const { onCLS, mod } = await loadWithSpies();

    // Stands in for Replay, which registers before the tracing side has opted in.
    mod.addClsInstrumentationHandler(() => {});
    mod.enableSoftNavigationReporting();
    await settled();

    expect(onCLS).toHaveBeenCalledWith(expect.any(Function), { reportAllChanges: false, reportSoftNavs: true });
  });

  it('starts the observer once no matter how many handlers register', async () => {
    const { onCLS, mod } = await loadWithSpies();

    mod.addClsInstrumentationHandler(() => {});
    mod.addClsInstrumentationHandler(() => {});
    await settled();

    expect(onCLS).toHaveBeenCalledTimes(1);
  });
});
