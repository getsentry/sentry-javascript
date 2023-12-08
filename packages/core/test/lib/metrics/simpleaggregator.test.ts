import { CounterMetric } from '../../../src/metrics/instance';
import { SimpleMetricsAggregator, serializeBuckets } from '../../../src/metrics/simpleaggregator';
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

    expect(firstValue[0].value).toEqual(2);
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
      aggregator.add('s', 'important_org_ids', 1, 'none', { numericKey: 2 });
      aggregator.add('s', 'important_org_ids', 2, 'none', { numericKey: 2 });

      expect(serializeBuckets(aggregator['_buckets'])).toContain('requests@none:8|c|T');
      expect(serializeBuckets(aggregator['_buckets'])).toContain('cpu@none:52:50:55:157:3|g|T');
      expect(serializeBuckets(aggregator['_buckets'])).toContain('lcp@second:1:1.2|d|#a:value,b:anothervalue|T');
      expect(serializeBuckets(aggregator['_buckets'])).toContain('important_org_ids@none:1:2|s|#numericKey:2|T');
    });
  });
});
