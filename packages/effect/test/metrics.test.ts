import { describe, expect, it } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { Duration, Effect, Metric, MetricBoundaries, MetricLabel } from 'effect';
import { afterEach, beforeEach, vi } from 'vitest';
import { createMetricsFlusher } from '../src/metrics';

describe('SentryEffectMetricsLayer', () => {
  const mockCount = vi.fn();
  const mockGauge = vi.fn();
  const mockDistribution = vi.fn();

  beforeEach(() => {
    vi.spyOn(sentryCore.metrics, 'count').mockImplementation(mockCount);
    vi.spyOn(sentryCore.metrics, 'gauge').mockImplementation(mockGauge);
    vi.spyOn(sentryCore.metrics, 'distribution').mockImplementation(mockDistribution);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.effect('creates counter metrics', () =>
    Effect.gen(function* () {
      const counter = Metric.counter('test_counter');

      yield* Metric.increment(counter);
      yield* Metric.increment(counter);
      yield* Metric.incrementBy(counter, 5);

      const snapshot = Metric.unsafeSnapshot();
      const counterMetric = snapshot.find(p => p.metricKey.name === 'test_counter');

      expect(counterMetric).toBeDefined();
    }),
  );

  it.effect('creates gauge metrics', () =>
    Effect.gen(function* () {
      const gauge = Metric.gauge('test_gauge');

      yield* Metric.set(gauge, 42);

      const snapshot = Metric.unsafeSnapshot();
      const gaugeMetric = snapshot.find(p => p.metricKey.name === 'test_gauge');

      expect(gaugeMetric).toBeDefined();
    }),
  );

  it.effect('creates histogram metrics', () =>
    Effect.gen(function* () {
      const histogram = Metric.histogram('test_histogram', MetricBoundaries.linear({ start: 0, width: 10, count: 10 }));

      yield* Metric.update(histogram, 5);
      yield* Metric.update(histogram, 15);
      yield* Metric.update(histogram, 25);

      const snapshot = Metric.unsafeSnapshot();
      const histogramMetric = snapshot.find(p => p.metricKey.name === 'test_histogram');

      expect(histogramMetric).toBeDefined();
    }),
  );

  it.effect('creates summary metrics', () =>
    Effect.gen(function* () {
      const summary = Metric.summary({
        name: 'test_summary',
        maxAge: '1 minute',
        maxSize: 100,
        error: 0.01,
        quantiles: [0.5, 0.9, 0.99],
      });

      yield* Metric.update(summary, 10);
      yield* Metric.update(summary, 20);
      yield* Metric.update(summary, 30);

      const snapshot = Metric.unsafeSnapshot();
      const summaryMetric = snapshot.find(p => p.metricKey.name === 'test_summary');

      expect(summaryMetric).toBeDefined();
    }),
  );

  it.effect('creates frequency metrics', () =>
    Effect.gen(function* () {
      const frequency = Metric.frequency('test_frequency');

      yield* Metric.update(frequency, 'foo');
      yield* Metric.update(frequency, 'bar');
      yield* Metric.update(frequency, 'foo');

      const snapshot = Metric.unsafeSnapshot();
      const frequencyMetric = snapshot.find(p => p.metricKey.name === 'test_frequency');

      expect(frequencyMetric).toBeDefined();
    }),
  );

  it.effect('supports metrics with labels', () =>
    Effect.gen(function* () {
      const counter = Metric.counter('labeled_counter').pipe(
        Metric.taggedWithLabels([MetricLabel.make('env', 'test'), MetricLabel.make('service', 'my-service')]),
      );

      yield* Metric.increment(counter);

      const snapshot = Metric.unsafeSnapshot();
      const labeledMetric = snapshot.find(p => p.metricKey.name === 'labeled_counter');

      expect(labeledMetric).toBeDefined();
      const tags = labeledMetric?.metricKey.tags ?? [];
      expect(tags.some(t => t.key === 'env' && t.value === 'test')).toBe(true);
      expect(tags.some(t => t.key === 'service' && t.value === 'my-service')).toBe(true);
    }),
  );

  it.effect('tracks Effect durations with timer metric', () =>
    Effect.gen(function* () {
      const timer = Metric.timerWithBoundaries('operation_duration', [10, 50, 100, 500, 1000]);

      yield* Effect.succeed('done').pipe(Metric.trackDuration(timer));

      const snapshot = Metric.unsafeSnapshot();
      const timerMetric = snapshot.find(p => p.metricKey.name === 'operation_duration');

      expect(timerMetric).toBeDefined();
    }),
  );

  it.effect('integrates with Effect.timed', () =>
    Effect.gen(function* () {
      const [duration, result] = yield* Effect.timed(Effect.succeed('completed'));

      expect(result).toBe('completed');
      expect(Duration.toMillis(duration)).toBeGreaterThanOrEqual(0);
    }),
  );
});

describe('createMetricsFlusher', () => {
  const mockCount = vi.fn();
  const mockGauge = vi.fn();
  const mockDistribution = vi.fn();

  beforeEach(() => {
    vi.spyOn(sentryCore.metrics, 'count').mockImplementation(mockCount);
    vi.spyOn(sentryCore.metrics, 'gauge').mockImplementation(mockGauge);
    vi.spyOn(sentryCore.metrics, 'distribution').mockImplementation(mockDistribution);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.effect('sends counter metrics to Sentry', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const counter = Metric.counter('flush_test_counter');

      yield* Metric.increment(counter);
      yield* Metric.incrementBy(counter, 4);

      flusher.flush();

      expect(mockCount).toHaveBeenCalledWith('flush_test_counter', 5, { attributes: {} });
    }),
  );

  it.effect('sends gauge metrics to Sentry', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const gauge = Metric.gauge('flush_test_gauge');

      yield* Metric.set(gauge, 42);

      flusher.flush();

      expect(mockGauge).toHaveBeenCalledWith('flush_test_gauge', 42, { attributes: {} });
    }),
  );

  it.effect('sends histogram metrics to Sentry', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const histogram = Metric.histogram(
        'flush_test_histogram',
        MetricBoundaries.linear({ start: 0, width: 10, count: 5 }),
      );

      yield* Metric.update(histogram, 5);
      yield* Metric.update(histogram, 15);

      flusher.flush();

      expect(mockDistribution).toHaveBeenCalledWith('flush_test_histogram.sum', expect.any(Number), { attributes: {} });
      expect(mockGauge).toHaveBeenCalledWith('flush_test_histogram.count', expect.any(Number), { attributes: {} });
      expect(mockGauge).toHaveBeenCalledWith('flush_test_histogram.min', expect.any(Number), { attributes: {} });
      expect(mockGauge).toHaveBeenCalledWith('flush_test_histogram.max', expect.any(Number), { attributes: {} });
    }),
  );

  it.effect('sends summary metrics to Sentry', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const summary = Metric.summary({
        name: 'flush_test_summary',
        maxAge: '1 minute',
        maxSize: 100,
        error: 0.01,
        quantiles: [0.5, 0.9, 0.99],
      });

      yield* Metric.update(summary, 10);
      yield* Metric.update(summary, 20);
      yield* Metric.update(summary, 30);

      flusher.flush();

      expect(mockDistribution).toHaveBeenCalledWith('flush_test_summary.sum', 60, { attributes: {} });
      expect(mockGauge).toHaveBeenCalledWith('flush_test_summary.count', 3, { attributes: {} });
      expect(mockGauge).toHaveBeenCalledWith('flush_test_summary.min', 10, { attributes: {} });
      expect(mockGauge).toHaveBeenCalledWith('flush_test_summary.max', 30, { attributes: {} });
    }),
  );

  it.effect('sends frequency metrics to Sentry', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const frequency = Metric.frequency('flush_test_frequency');

      yield* Metric.update(frequency, 'apple');
      yield* Metric.update(frequency, 'banana');
      yield* Metric.update(frequency, 'apple');

      flusher.flush();

      expect(mockCount).toHaveBeenCalledWith('flush_test_frequency', 2, { attributes: { word: 'apple' } });
      expect(mockCount).toHaveBeenCalledWith('flush_test_frequency', 1, { attributes: { word: 'banana' } });
    }),
  );

  it.effect('sends metrics with labels as attributes to Sentry', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const gauge = Metric.gauge('flush_test_labeled_gauge').pipe(
        Metric.taggedWithLabels([MetricLabel.make('env', 'production'), MetricLabel.make('region', 'us-east')]),
      );

      yield* Metric.set(gauge, 100);

      flusher.flush();

      expect(mockGauge).toHaveBeenCalledWith('flush_test_labeled_gauge', 100, {
        attributes: { env: 'production', region: 'us-east' },
      });
    }),
  );

  it.effect('sends counter delta values on subsequent flushes', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const counter = Metric.counter('flush_test_delta_counter');

      yield* Metric.incrementBy(counter, 10);
      flusher.flush();

      mockCount.mockClear();

      yield* Metric.incrementBy(counter, 5);
      flusher.flush();

      expect(mockCount).toHaveBeenCalledWith('flush_test_delta_counter', 5, { attributes: {} });
    }),
  );

  it.effect('does not send counter when delta is zero', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const counter = Metric.counter('flush_test_zero_delta');

      yield* Metric.incrementBy(counter, 10);
      flusher.flush();

      mockCount.mockClear();

      flusher.flush();

      expect(mockCount).not.toHaveBeenCalledWith('flush_test_zero_delta', 0, { attributes: {} });
    }),
  );

  it.effect('clear() resets delta tracking state', () =>
    Effect.gen(function* () {
      const flusher = createMetricsFlusher();
      const counter = Metric.counter('flush_test_clear_counter');

      yield* Metric.incrementBy(counter, 10);
      flusher.flush();

      mockCount.mockClear();
      flusher.clear();

      flusher.flush();

      expect(mockCount).toHaveBeenCalledWith('flush_test_clear_counter', 10, { attributes: {} });
    }),
  );

  it('each flusher has isolated state', () => {
    const flusher1 = createMetricsFlusher();
    const flusher2 = createMetricsFlusher();

    expect(flusher1).not.toBe(flusher2);
    expect(flusher1.flush).not.toBe(flusher2.flush);
    expect(flusher1.clear).not.toBe(flusher2.clear);
  });
});
