import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { getClient, getMainCarrier, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addPerformanceEntries } from '../../src/performance/entries';
import { WINDOW } from '../../src/types';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  const browserPerformanceTimeOrigin = vi.fn();
  return {
    ...actual,
    browserPerformanceTimeOrigin,
    performanceTimeToSeconds: (time: number, entryStartTime = time) =>
      (browserPerformanceTimeOrigin(entryStartTime) + time) / 1000,
  };
});

const pageloadOriginMs = 1_000_000;
const sleepDurationMs = 3_600_000;
// The `performance.now()` time from which the corrected time origin applies.
const correctionFromMs = 10_000;

describe('addPerformanceEntries', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    vi.mocked(SentryCore.browserPerformanceTimeOrigin).mockImplementation((monotonicTimeInMs = 0) =>
      monotonicTimeInMs < correctionFromMs ? pageloadOriginMs : pageloadOriginMs + sleepDurationMs,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the resource spans of a navigation that happens after a time origin correction', () => {
    const resourceStartTime = 12_000;
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('location', { origin: 'https://example.com' });
    vi.spyOn(WINDOW.performance, 'getEntries').mockReturnValue([
      {
        entryType: 'resource',
        name: 'https://example.com/app.js',
        initiatorType: 'script',
        startTime: resourceStartTime,
        duration: 100,
        responseEnd: resourceStartTime + 100,
        toJSON: () => ({}),
      } as PerformanceResourceTiming,
    ]);

    const navigationStartTimestamp = (pageloadOriginMs + sleepDurationMs + resourceStartTime - 50) / 1000;
    const span = new SentrySpan({
      op: 'navigation',
      name: '/next',
      sampled: true,
      startTimestamp: navigationStartTimestamp,
    });

    const endedSpans: Span[] = [];
    getClient()?.on('spanEnd', endedSpan => void endedSpans.push(endedSpan));

    addPerformanceEntries(span, { ignoreResourceSpans: [] });

    expect(endedSpans.map(spanToJSON)).toEqual([
      expect.objectContaining({
        start_timestamp: (pageloadOriginMs + sleepDurationMs + resourceStartTime) / 1000,
        end_timestamp: (pageloadOriginMs + sleepDurationMs + resourceStartTime + 100) / 1000,
        attributes: expect.objectContaining({
          'sentry.op': 'resource.script',
          'http.request.response_end': (pageloadOriginMs + sleepDurationMs + resourceStartTime + 100) / 1000,
        }),
      }),
    ]);
  });
});
