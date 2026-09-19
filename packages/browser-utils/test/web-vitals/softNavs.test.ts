import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_NAVIGATION_ID } from '@sentry/conventions/attributes';

const windowListeners = vi.hoisted(() => new Map<string, (event: unknown) => void>());
const performanceHandlers = vi.hoisted(() => new Map<string, (data: { entries: unknown[] }) => void>());

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return { ...actual, spanToJSON: vi.fn() };
});

vi.mock('../../src/types', () => ({
  WINDOW: {
    addEventListener: (type: string, listener: (event: unknown) => void) => windowListeners.set(type, listener),
    PerformanceSoftNavigation: { prototype: { getLargestInteractionContentfulPaint: () => null } },
  },
}));

vi.mock('../../src/instrumentation/performanceObserver', async () => {
  const actual = await vi.importActual('../../src/instrumentation/performanceObserver');
  return {
    ...actual,
    addPerformanceInstrumentationHandler: (type: string, callback: (data: { entries: unknown[] }) => void) => {
      performanceHandlers.set(type, callback);
      return () => undefined;
    },
  };
});

function createMockSpan(op: string) {
  vi.mocked(SentryCore.spanToJSON).mockReturnValue({ attributes: { 'sentry.op': op } } as never);
  return { setAttribute: vi.fn() };
}

function createMockClient() {
  const hooks = new Map<string, (...args: never[]) => void>();
  return {
    client: { on: (hook: string, callback: (...args: never[]) => void) => hooks.set(hook, callback) },
    startSpan: (span: unknown) => hooks.get('spanStart')?.(span as never),
  };
}

/** Each test needs a fresh module: the correlation state is per page, so it's module-level. */
async function loadSoftNavs() {
  vi.resetModules();
  return import('../../src/web-vitals/softNavs');
}

describe('soft navigation correlation', () => {
  beforeEach(() => {
    windowListeners.clear();
    performanceHandlers.clear();
    vi.stubGlobal('PerformanceObserver', { supportedEntryTypes: ['event', 'soft-navigation'] });
    // Pinned so the fixtures' interaction timestamps below stay inside `MAX_INTERACTION_AGE_MS`.
    vi.spyOn(performance, 'now').mockReturnValue(1500);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('correlates a soft navigation to the navigation span its interaction triggered', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    const navigationSpan = createMockSpan('navigation');
    startSpan(navigationSpan);

    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1234, interactionId: 42 }] });
    performanceHandlers.get('soft-navigation')?.({ entries: [{ navigationId: 7, interactionId: 42 }] });

    expect(navigationSpan.setAttribute).toHaveBeenCalledWith(BROWSER_NAVIGATION_ID, 7);
    expect(getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7 })).toBe(navigationSpan);
  });

  it('correlates when the interaction entry is delivered before the navigation span starts', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    // The router code that starts the span has not run yet, so the entry gets here first.
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1234, interactionId: 42 }] });

    const navigationSpan = createMockSpan('navigation');
    startSpan(navigationSpan);

    performanceHandlers.get('soft-navigation')?.({ entries: [{ navigationId: 7, interactionId: 42 }] });

    expect(navigationSpan.setAttribute).toHaveBeenCalledWith(BROWSER_NAVIGATION_ID, 7);
    expect(getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7 })).toBe(navigationSpan);
  });

  it('does not let a later navigation steal an interaction a navigation already claimed', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1000 });
    const navigationSpan = createMockSpan('navigation');
    startSpan(navigationSpan);

    // One interaction produces several entries. The first binds; the rest are delivered after the
    // span is no longer pending.
    performanceHandlers.get('event')?.({
      entries: [
        { duration: 8, startTime: 1000, interactionId: 42 },
        { duration: 8, startTime: 999, interactionId: 42 },
      ],
    });

    // A programmatic navigation, with no interaction of its own, must not claim interaction 42.
    startSpan(createMockSpan('navigation'));

    expect(
      getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7, navigationInteractionId: 42 }),
    ).toBe(navigationSpan);
  });

  it('does not bind a navigation to an interaction that is too old to have driven it', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    // A click that drove no navigation, so its entries stay unbound.
    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1000 });
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1000, interactionId: 42 }] });

    // Well past `MAX_INTERACTION_AGE_MS`, a programmatic navigation starts.
    vi.spyOn(performance, 'now').mockReturnValue(4000);
    startSpan(createMockSpan('navigation'));

    expect(
      getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7, navigationInteractionId: 42 }),
    ).toBeUndefined();
  });

  it('does not bind an early entry to a navigation from a different interaction', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 500 });
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 500, interactionId: 1 }] });

    // A second click, whose own entry has not arrived, is what this navigation happened during.
    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    const navigationSpan = createMockSpan('navigation');
    startSpan(navigationSpan);

    performanceHandlers.get('soft-navigation')?.({ entries: [{ navigationId: 7, interactionId: 1 }] });

    expect(navigationSpan.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7 })).toBeUndefined();
  });

  it('caps how many unbound interaction entries it holds', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1 });
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1, interactionId: 1 }] });

    // 20 later interactions push the first one out of the list.
    for (let i = 0; i < 20; i++) {
      const startTime = 100 + i * 100;
      windowListeners.get('click')?.({ isTrusted: true, timeStamp: startTime });
      performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime, interactionId: i + 2 }] });
    }

    // A navigation for the evicted interaction can no longer find it.
    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1 });
    startSpan(createMockSpan('navigation'));

    expect(
      getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7, navigationInteractionId: 1 }),
    ).toBeUndefined();
  });

  it('falls back to the interaction id when the soft navigation entry has not been observed yet', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    const navigationSpan = createMockSpan('navigation');
    startSpan(navigationSpan);

    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1234, interactionId: 42 }] });

    expect(
      getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7, navigationInteractionId: 42 }),
    ).toBe(navigationSpan);
  });

  it('does not bind an interaction that the navigation did not happen during', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    const navigationSpan = createMockSpan('navigation');
    startSpan(navigationSpan);

    // An earlier, unrelated interaction whose entry is only delivered now.
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 500, interactionId: 1 }] });
    performanceHandlers.get('soft-navigation')?.({ entries: [{ navigationId: 7, interactionId: 1 }] });

    expect(navigationSpan.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7 })).toBeUndefined();
  });

  it('ignores navigations that did not follow an interaction', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    startSpan(createMockSpan('navigation'));
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1234, interactionId: 42 }] });

    expect(
      getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7, navigationInteractionId: 42 }),
    ).toBeUndefined();
  });

  it('ignores spans that are not navigations', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    startSpan(createMockSpan('pageload'));
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1234, interactionId: 42 }] });

    expect(
      getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7, navigationInteractionId: 42 }),
    ).toBeUndefined();
  });

  it('does not correlate metrics that are not for a soft navigation', async () => {
    const { getNavigationSpanForMetric, startSoftNavigationCorrelation } = await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    startSpan(createMockSpan('navigation'));
    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1234, interactionId: 42 }] });
    performanceHandlers.get('soft-navigation')?.({ entries: [{ navigationId: 7, interactionId: 42 }] });

    expect(getNavigationSpanForMetric({ navigationType: 'navigate', navigationId: 7 })).toBeUndefined();
  });

  it('is a no-op in browsers without the Soft Navigations API', async () => {
    vi.stubGlobal('PerformanceObserver', { supportedEntryTypes: ['event'] });

    const { startSoftNavigationCorrelation, supportsSoftNavigations } = await loadSoftNavs();
    const { client } = createMockClient();

    expect(supportsSoftNavigations()).toBe(false);

    startSoftNavigationCorrelation(client as never);

    expect(windowListeners.size).toBe(0);
    expect(performanceHandlers.size).toBe(0);
  });
});
