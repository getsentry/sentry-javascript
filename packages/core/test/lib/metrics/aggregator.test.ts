import { MetricsAggregator } from '../../../src/metrics/aggregator';
import { MAX_WEIGHT } from '../../../src/metrics/constants';
import { CounterMetric } from '../../../src/metrics/instance';
import { serializeMetricBuckets } from '../../../src/metrics/utils';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

let testClient: TestClient;

describe('MetricsAggregator', () => {
  const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });

  beforeEach(() => {
    jest.useFakeTimers('legacy');
    testClient = new TestClient(options);
  });

  it('adds items to buckets', () => {
    const aggregator = new MetricsAggregator(testClient);
    aggregator.add('c', 'requests', 1);
    expect(aggregator['_buckets'].size).toEqual(1);

    const firstValue = aggregator['_buckets'].values().next().value;
    expect(firstValue).toEqual({
      metric: expect.any(CounterMetric),
      metricType: 'c',
      name: 'requests',
      tags: {},
      timestamp: expect.any(Number),
      unit: 'none',
    });
  });

  it('groups same items together', () => {
    const aggregator = new MetricsAggregator(testClient);
    aggregator.add('c', 'requests', 1);
    expect(aggregator['_buckets'].size).toEqual(1);
    aggregator.add('c', 'requests', 1);
    expect(aggregator['_buckets'].size).toEqual(1);

    const firstValue = aggregator['_buckets'].values().next().value;
    expect(firstValue).toEqual({
      metric: expect.any(CounterMetric),
      metricType: 'c',
      name: 'requests',
      tags: {},
      timestamp: expect.any(Number),
      unit: 'none',
    });
    expect(firstValue.metric._value).toEqual(2);
  });

  it('differentiates based on tag value', () => {
    const aggregator = new MetricsAggregator(testClient);
    aggregator.add('g', 'cpu', 50);
    expect(aggregator['_buckets'].size).toEqual(1);
    aggregator.add('g', 'cpu', 55, undefined, { a: 'value' });
    expect(aggregator['_buckets'].size).toEqual(2);
  });

  describe('serializeBuckets', () => {
    it('serializes ', () => {
      const aggregator = new MetricsAggregator(testClient);
      aggregator.add('c', 'requests', 8);
      aggregator.add('g', 'cpu', 50);
      aggregator.add('g', 'cpu', 55);
      aggregator.add('g', 'cpu', 52);
      aggregator.add('d', 'lcp', 1, 'second', { a: 'value', b: 'anothervalue' });
      aggregator.add('d', 'lcp', 1.2, 'second', { a: 'value', b: 'anothervalue' });
      aggregator.add('s', 'important_people', 'a', 'none', { numericKey: 2 });
      aggregator.add('s', 'important_people', 'b', 'none', { numericKey: 2 });

      const metricBuckets = Array.from(aggregator['_buckets']).map(([, bucketItem]) => bucketItem);
      const serializedBuckets = serializeMetricBuckets(metricBuckets);

      expect(serializedBuckets).toContain('requests@none:8|c|T');
      expect(serializedBuckets).toContain('cpu@none:52:50:55:157:3|g|T');
      expect(serializedBuckets).toContain('lcp@second:1:1.2|d|#a:value,b:anothervalue|T');
      expect(serializedBuckets).toContain('important_people@none:97:98|s|#numericKey:2|T');
    });
  });

  describe('close', () => {
    test('should flush immediately', () => {
      const capture = jest.spyOn(testClient, 'captureAggregateMetrics');
      const aggregator = new MetricsAggregator(testClient);
      aggregator.add('c', 'requests', 1);
      aggregator.close();
      // It should clear the interval.
      expect(clearInterval).toHaveBeenCalled();
      expect(capture).toBeCalled();
      expect(capture).toBeCalledTimes(1);
      expect(capture).toBeCalledWith([
        {
          metric: { _value: 1 },
          metricType: 'c',
          name: 'requests',
          tags: {},
          timestamp: expect.any(Number),
          unit: 'none',
        },
      ]);
    });
  });

  describe('flush', () => {
    test('should flush immediately', () => {
      const capture = jest.spyOn(testClient, 'captureAggregateMetrics');
      const aggregator = new MetricsAggregator(testClient);
      aggregator.add('c', 'requests', 1);
      aggregator.flush();
      expect(capture).toBeCalled();
      expect(capture).toBeCalledTimes(1);
      expect(capture).toBeCalledWith([
        {
          metric: { _value: 1 },
          metricType: 'c',
          name: 'requests',
          tags: {},
          timestamp: expect.any(Number),
          unit: 'none',
        },
      ]);
      capture.mockReset();
      aggregator.close();
      // It should clear the interval.
      expect(clearInterval).toHaveBeenCalled();

      // It shouldn't be called since it's been already flushed.
      expect(capture).toBeCalledTimes(0);
    });

    test('should not capture if empty', () => {
      const capture = jest.spyOn(testClient, 'captureAggregateMetrics');
      const aggregator = new MetricsAggregator(testClient);
      aggregator.add('c', 'requests', 1);
      aggregator.flush();
      expect(capture).toBeCalledTimes(1);
      capture.mockReset();
      aggregator.close();
      expect(capture).toBeCalledTimes(0);
    });
  });

  describe('add', () => {
    test('it should respect the max weight and flush if exceeded', () => {
      const capture = jest.spyOn(testClient, 'captureAggregateMetrics');
      const aggregator = new MetricsAggregator(testClient);

      for (let i = 0; i < MAX_WEIGHT; i++) {
        aggregator.add('c', 'requests', 1);
      }

      expect(capture).toBeCalledTimes(1);
      aggregator.close();
    });
  });
});
