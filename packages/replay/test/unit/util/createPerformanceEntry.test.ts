jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));

jest.mock('@sentry/utils', () => ({
  ...jest.requireActual('@sentry/utils'),
  browserPerformanceTimeOrigin: Date.now(),
}));

import { WINDOW } from '../../../src/constants';
import { createPerformanceEntries, getLargestContentfulPaint } from '../../../src/util/createPerformanceEntries';
import { PerformanceEntryNavigation } from '../../fixtures/performanceEntry/navigation';

describe('Unit | util | createPerformanceEntries', () => {
  beforeEach(function () {
    if (!WINDOW.performance.getEntriesByType) {
      WINDOW.performance.getEntriesByType = jest.fn((type: string) => {
        if (type === 'navigation') {
          return [PerformanceEntryNavigation()];
        }
        throw new Error(`entry ${type} not mocked`);
      });
    }
  });

  afterAll(function () {
    jest.clearAllMocks();
    jest.useRealTimers();
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

  describe('getLargestContentfulPaint', () => {
    it('works with an LCP metric', async () => {
      const metric = {
        value: 5108.299,
        entries: [],
      };

      const event = getLargestContentfulPaint(metric);

      expect(event).toEqual({
        type: 'largest-contentful-paint',
        name: 'largest-contentful-paint',
        start: 1672531205.108299,
        end: 1672531205.108299,
        data: { value: 5108.299, size: 5108.299, nodeId: undefined },
      });
    });
  });
});
