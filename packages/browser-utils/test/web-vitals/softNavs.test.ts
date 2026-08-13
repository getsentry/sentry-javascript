import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('correlates a soft navigation to the navigation span its interaction triggered', async () => {
    const { getNavigationSpanForMetric, SOFT_NAVIGATION_ID_ATTRIBUTE, startSoftNavigationCorrelation } =
      await loadSoftNavs();
    const { client, startSpan } = createMockClient();

    startSoftNavigationCorrelation(client as never);

    windowListeners.get('click')?.({ isTrusted: true, timeStamp: 1234 });
    const navigationSpan = createMockSpan('navigation');
    startSpan(navigationSpan);

    performanceHandlers.get('event')?.({ entries: [{ duration: 8, startTime: 1234, interactionId: 42 }] });
    performanceHandlers.get('soft-navigation')?.({ entries: [{ navigationId: 7, interactionId: 42 }] });

    expect(navigationSpan.setAttribute).toHaveBeenCalledWith(SOFT_NAVIGATION_ID_ATTRIBUTE, 7);
    expect(getNavigationSpanForMetric({ navigationType: 'soft-navigation', navigationId: 7 })).toBe(navigationSpan);
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
