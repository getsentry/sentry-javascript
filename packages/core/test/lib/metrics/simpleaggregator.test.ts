import { CounterMetric } from '../../../src/metrics/instance';
import { SimpleMetricsAggregator } from '../../../src/metrics/simpleaggregator';
import { serializeMetricBuckets } from '../../../src/metrics/utils';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

describe('SimpleMetricsAggregator', () => {
  const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });
  const testClient = new TestClient(options);

  it('adds items to buckets', () => {
    const aggregator = new SimpleMetricsAggregator(testClient);
    aggregator.add('c', 'requests', 1);
    expect(aggregator['_buckets'].size).toEqual(1);

    const firstValue = aggregator['_buckets'].values().next().value;
    expect(firstValue).toEqual([expect.any(CounterMetric), expect.any(Number), 'c', 'requests', 'none', {}]);
  });

  it('groups same items together', () => {
    const aggregator = new SimpleMetricsAggregator(testClient);
    aggregator.add('c', 'requests', 1);
    expect(aggregator['_buckets'].size).toEqual(1);
    aggregator.add('c', 'requests', 1);
    expect(aggregator['_buckets'].size).toEqual(1);

    const firstValue = aggregator['_buckets'].values().next().value;
    expect(firstValue).toEqual([expect.any(CounterMetric), expect.any(Number), 'c', 'requests', 'none', {}]);

    expect(firstValue[0]._value).toEqual(2);
  });

  it('differentiates based on tag value', () => {
    const aggregator = new SimpleMetricsAggregator(testClient);
    aggregator.add('g', 'cpu', 50);
    expect(aggregator['_buckets'].size).toEqual(1);
    aggregator.add('g', 'cpu', 55, undefined, { a: 'value' });
    expect(aggregator['_buckets'].size).toEqual(2);
  });

  describe('serializeBuckets', () => {
    it('serializes ', () => {
      const aggregator = new SimpleMetricsAggregator(testClient);
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
});
