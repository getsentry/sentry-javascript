import '../../utils/mock-internal-setTimeout';
import { browserPerformanceTimeOrigin } from '@sentry/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WINDOW } from '../../../src/constants';
import {
  createPerformanceEntries,
  getCumulativeLayoutShift,
  getInteractionToNextPaint,
  getLargestContentfulPaint,
} from '../../../src/util/createPerformanceEntries';
import { PerformanceEntryNavigation } from '../../fixtures/performanceEntry/navigation';

const TIME_ORIGIN = new Date('2023-01-01').getTime();

vi.mock('@sentry/core', async () => ({
  ...(await vi.importActual('@sentry/core')),
  browserPerformanceTimeOrigin: vi.fn(() => new Date('2023-01-01').getTime()),
}));

describe('Unit | util | createPerformanceEntries', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01'));
  });

  beforeEach(function () {
    vi.mocked(browserPerformanceTimeOrigin).mockReturnValue(TIME_ORIGIN);

    if (!WINDOW.performance.getEntriesByType) {
      WINDOW.performance.getEntriesByType = vi.fn((type: string) => {
        if (type === 'navigation') {
          return [PerformanceEntryNavigation()];
        }
        throw new Error(`entry ${type} not mocked`);
      });
    }
  });

  afterAll(function () {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('ignores sdks own requests', function () {
    const data = {
      name: 'https://ingest.f00.f00/api/1/envelope/?sentry_key=dsn&sentry_version=7',
      entryType: 'resource',
      startTime: 234462.69999998808,
      duration: 55.70000001788139,
      initiatorType: 'fetch',
      nextHopProtocol: '',
      workerStart: 0,
      redirectStart: 0,
      redirectEnd: 0,
      fetchStart: 234462.69999998808,
      domainLookupStart: 0,
      domainLookupEnd: 0,
      connectStart: 0,
      connectEnd: 0,
      secureConnectionStart: 0,
      requestStart: 0,
      responseStart: 0,
      responseEnd: 234518.40000000596,
      transferSize: 0,
      encodedBodySize: 0,
      decodedBodySize: 0,
      serverTiming: [],
      workerTiming: [],
    } as const;

    // @ts-expect-error Needs a PerformanceEntry mock
    expect(createPerformanceEntries([data])).toEqual([]);
  });

  it('converts a buffered entry with the time origin from when it was recorded', () => {
    // Entries are converted on flush, which can be after a time origin correction. Only times after the drift should use
    // the new origin.
    const driftPointMs = 200_000;
    const sleepDurationMs = 3_600_000;
    vi.mocked(browserPerformanceTimeOrigin).mockImplementation((time = 0) =>
      time < driftPointMs ? TIME_ORIGIN : TIME_ORIGIN + sleepDurationMs,
    );

    const entries = createPerformanceEntries([
      { name: 'first-paint', entryType: 'paint', startTime: 1000, duration: 0 },
      { name: 'first-contentful-paint', entryType: 'paint', startTime: driftPointMs + 1000, duration: 0 },
    ] as PerformanceEntry[]);

    expect(entries).toEqual([
      expect.objectContaining({ name: 'first-paint', start: (TIME_ORIGIN + 1000) / 1000 }),
      expect.objectContaining({
        name: 'first-contentful-paint',
        start: (TIME_ORIGIN + sleepDurationMs + driftPointMs + 1000) / 1000,
      }),
    ]);
  });

  it('converts all timings of a resource entry with the time origin from its start', () => {
    // The resource was still loading when the time origin was corrected. Its end must not include the drift.
    const driftPointMs = 200_000;
    const sleepDurationMs = 3_600_000;
    vi.mocked(browserPerformanceTimeOrigin).mockImplementation((time = 0) =>
      time < driftPointMs ? TIME_ORIGIN : TIME_ORIGIN + sleepDurationMs,
    );

    const entries = createPerformanceEntries([
      {
        name: 'https://example.com/app.js',
        entryType: 'resource',
        initiatorType: 'script',
        startTime: driftPointMs - 100,
        responseEnd: driftPointMs + 200,
        duration: 300,
      },
    ] as PerformanceResourceTiming[]);

    expect(entries).toEqual([
      expect.objectContaining({
        start: (TIME_ORIGIN + driftPointMs - 100) / 1000,
        end: (TIME_ORIGIN + driftPointMs + 200) / 1000,
      }),
    ]);
  });

  describe('getLargestContentfulPaint', () => {
    it('works with an LCP metric', async () => {
      const metric = {
        value: 5108.299,
        rating: 'good' as const,
        entries: [],
      };

      const event = getLargestContentfulPaint(metric);

      expect(event).toEqual({
        type: 'web-vital',
        name: 'largest-contentful-paint',
        start: 1672531205.108299,
        end: 1672531205.108299,
        data: { value: 5108.299, rating: 'good', size: 5108.299, nodeIds: undefined, attributions: undefined },
      });
    });
  });

  describe('getCumulativeLayoutShift', () => {
    it('works with a CLS metric', async () => {
      const metric = {
        value: 5108.299,
        rating: 'good' as const,
        entries: [],
      };

      const event = getCumulativeLayoutShift(metric);

      expect(event).toEqual({
        type: 'web-vital',
        name: 'cumulative-layout-shift',
        start: 1672531205.108299,
        end: 1672531205.108299,
        data: { value: 5108.299, size: 5108.299, rating: 'good', nodeIds: [], attributions: [] },
      });
    });
  });

  describe('getInteractionToNextPaint', () => {
    it('works with an INP metric', async () => {
      const metric = {
        value: 5108.299,
        rating: 'good' as const,
        entries: [],
      };

      const event = getInteractionToNextPaint(metric);

      expect(event).toEqual({
        type: 'web-vital',
        name: 'interaction-to-next-paint',
        start: 1672531205.108299,
        end: 1672531205.108299,
        data: { value: 5108.299, size: 5108.299, rating: 'good', nodeIds: undefined, attributions: undefined },
      });
    });
  });
});
