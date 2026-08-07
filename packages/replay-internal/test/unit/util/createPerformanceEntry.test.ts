import '../../utils/mock-internal-setTimeout';
import { correctedPerformanceTimeOrigin } from '@sentry/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WINDOW } from '../../../src/constants';
import {
  createPerformanceEntries,
  getCumulativeLayoutShift,
  getInteractionToNextPaint,
  getLargestContentfulPaint,
  rememberEntryTimeOrigin,
} from '../../../src/util/createPerformanceEntries';
import { PerformanceEntryNavigation } from '../../fixtures/performanceEntry/navigation';

vi.mock('@sentry/core', async () => ({
  ...(await vi.importActual('@sentry/core')),
  correctedPerformanceTimeOrigin: vi.fn(() => new Date('2023-01-01').getTime()),
}));

describe('Unit | util | createPerformanceEntries', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01'));
  });

  beforeEach(function () {
    vi.mocked(correctedPerformanceTimeOrigin).mockReturnValue(new Date('2023-01-01').getTime());

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

  describe('time origin stamping', () => {
    const TIME_ORIGIN = new Date('2023-01-01').getTime();
    // A sleep long enough for `timestampInSeconds` to re-derive its time origin.
    const DRIFT_MS = 360_000;

    function resourceEntry(): PerformanceEntry {
      return {
        name: 'https://example.com/script.js',
        entryType: 'resource',
        startTime: 1_000,
        duration: 100,
        initiatorType: 'script',
        responseEnd: 1_100,
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 0,
      } as unknown as PerformanceEntry;
    }

    it('converts a stamped entry against the origin from when it was observed', () => {
      const entry = resourceEntry();

      rememberEntryTimeOrigin(entry);

      // The origin is corrected after the entry was observed but before it is flushed.
      vi.mocked(correctedPerformanceTimeOrigin).mockReturnValue(TIME_ORIGIN + DRIFT_MS);

      const [replayEntry] = createPerformanceEntries([entry]);

      expect(replayEntry?.start).toBe((TIME_ORIGIN + 1_000) / 1000);
      expect(replayEntry?.end).toBe((TIME_ORIGIN + 1_100) / 1000);
    });

    it('falls back to the current origin for an entry that was never stamped', () => {
      vi.mocked(correctedPerformanceTimeOrigin).mockReturnValue(TIME_ORIGIN + DRIFT_MS);

      const [replayEntry] = createPerformanceEntries([resourceEntry()]);

      expect(replayEntry?.start).toBe((TIME_ORIGIN + DRIFT_MS + 1_000) / 1000);
    });

    it('stamps each entry with the origin in effect when it was observed', () => {
      const early = resourceEntry();
      rememberEntryTimeOrigin(early);

      vi.mocked(correctedPerformanceTimeOrigin).mockReturnValue(TIME_ORIGIN + DRIFT_MS);
      const late = resourceEntry();
      rememberEntryTimeOrigin(late);

      const [earlyEntry, lateEntry] = createPerformanceEntries([early, late]);

      // Both entries carry the same monotonic `startTime`, so a shared origin would collapse them onto the same
      // wall clock time even though they were observed on either side of a correction.
      expect(earlyEntry?.start).toBe((TIME_ORIGIN + 1_000) / 1000);
      expect(lateEntry?.start).toBe((TIME_ORIGIN + DRIFT_MS + 1_000) / 1000);
    });
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
