import { metrics as sentryMetrics } from '@sentry/core';
import * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import { scopedDiscard } from 'effect/Layer';
import * as Metric from 'effect/Metric';
import * as MetricKeyType from 'effect/MetricKeyType';
import type * as MetricPair from 'effect/MetricPair';
import * as MetricState from 'effect/MetricState';
import * as Schedule from 'effect/Schedule';

type MetricAttributes = Record<string, string>;

function labelsToAttributes(labels: ReadonlyArray<{ key: string; value: string }>): MetricAttributes {
  return labels.reduce((acc, label) => ({ ...acc, [label.key]: label.value }), {});
}

function sendMetricToSentry(pair: MetricPair.MetricPair.Untyped): void {
  const { metricKey, metricState } = pair;
  const name = metricKey.name;
  const attributes = labelsToAttributes(metricKey.tags);

  if (MetricState.isCounterState(metricState)) {
    const value = typeof metricState.count === 'bigint' ? Number(metricState.count) : metricState.count;
    sentryMetrics.count(name, value, { attributes });
  } else if (MetricState.isGaugeState(metricState)) {
    const value = typeof metricState.value === 'bigint' ? Number(metricState.value) : metricState.value;
    sentryMetrics.gauge(name, value, { attributes });
  } else if (MetricState.isHistogramState(metricState)) {
    sentryMetrics.distribution(`${name}.sum`, metricState.sum, { attributes });
    sentryMetrics.gauge(`${name}.count`, metricState.count, { attributes });
    sentryMetrics.gauge(`${name}.min`, metricState.min, { attributes });
    sentryMetrics.gauge(`${name}.max`, metricState.max, { attributes });
  } else if (MetricState.isSummaryState(metricState)) {
    sentryMetrics.distribution(`${name}.sum`, metricState.sum, { attributes });
    sentryMetrics.gauge(`${name}.count`, metricState.count, { attributes });
    sentryMetrics.gauge(`${name}.min`, metricState.min, { attributes });
    sentryMetrics.gauge(`${name}.max`, metricState.max, { attributes });
  } else if (MetricState.isFrequencyState(metricState)) {
    for (const [word, count] of metricState.occurrences) {
      sentryMetrics.count(name, count, {
        attributes: { ...attributes, word },
      });
    }
  }
}

const previousCounterValues = new Map<string, number>();

function getMetricId(pair: MetricPair.MetricPair.Untyped): string {
  const tags = pair.metricKey.tags.map(t => `${t.key}=${t.value}`).join(',');
  return `${pair.metricKey.name}:${tags}`;
}

function sendDeltaMetricToSentry(pair: MetricPair.MetricPair.Untyped): void {
  const { metricKey, metricState } = pair;
  const name = metricKey.name;
  const attributes = labelsToAttributes(metricKey.tags);
  const metricId = getMetricId(pair);

  if (MetricState.isCounterState(metricState)) {
    const currentValue = typeof metricState.count === 'bigint' ? Number(metricState.count) : metricState.count;

    const previousValue = previousCounterValues.get(metricId) ?? 0;
    const delta = currentValue - previousValue;

    if (delta > 0) {
      sentryMetrics.count(name, delta, { attributes });
    }

    previousCounterValues.set(metricId, currentValue);
  } else {
    sendMetricToSentry(pair);
  }
}

/**
 * Flushes all Effect metrics to Sentry.
 * This is called periodically by the SentryEffectMetricsLayer.
 * Exported for testing purposes.
 * @internal
 */
export function flushMetricsToSentry(): void {
  const snapshot = Metric.unsafeSnapshot();

  snapshot.forEach(pair => {
    if (MetricKeyType.isCounterKey(pair.metricKey.keyType)) {
      sendDeltaMetricToSentry(pair);
    } else {
      sendMetricToSentry(pair);
    }
  });
}

const metricsReporterEffect = Effect.gen(function* () {
  const schedule = Schedule.spaced('10 seconds');

  yield* Effect.repeat(
    Effect.sync(() => flushMetricsToSentry()),
    schedule,
  );
}).pipe(Effect.interruptible);

/**
 * Effect Layer that periodically flushes metrics to Sentry.
 */
export const SentryEffectMetricsLayer: Layer.Layer<never, never, never> = scopedDiscard(
  Effect.forkScoped(metricsReporterEffect),
);
