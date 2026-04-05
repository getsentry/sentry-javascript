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
    const value = Number(metricState.count);
    sentryMetrics.count(name, value, { attributes });
  } else if (MetricState.isGaugeState(metricState)) {
    const value = Number(metricState.value);
    sentryMetrics.gauge(name, value, { attributes });
  } else if (MetricState.isHistogramState(metricState)) {
    sentryMetrics.gauge(`${name}.sum`, metricState.sum, { attributes });
    sentryMetrics.gauge(`${name}.count`, metricState.count, { attributes });
    sentryMetrics.gauge(`${name}.min`, metricState.min, { attributes });
    sentryMetrics.gauge(`${name}.max`, metricState.max, { attributes });
  } else if (MetricState.isSummaryState(metricState)) {
    sentryMetrics.gauge(`${name}.sum`, metricState.sum, { attributes });
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

function getMetricId(pair: MetricPair.MetricPair.Untyped): string {
  const tags = pair.metricKey.tags.map(t => `${t.key}=${t.value}`).join(',');
  return `${pair.metricKey.name}:${tags}`;
}

function sendDeltaMetricToSentry(
  pair: MetricPair.MetricPair.Untyped,
  previousCounterValues: Map<string, number>,
): void {
  const { metricKey, metricState } = pair;
  const name = metricKey.name;
  const attributes = labelsToAttributes(metricKey.tags);
  const metricId = getMetricId(pair);

  if (MetricState.isCounterState(metricState)) {
    const currentValue = Number(metricState.count);

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
 * @param previousCounterValues - Map tracking previous counter values for delta calculation
 */
function flushMetricsToSentry(previousCounterValues: Map<string, number>): void {
  const snapshot = Metric.unsafeSnapshot();

  snapshot.forEach((pair: MetricPair.MetricPair.Untyped) => {
    if (MetricKeyType.isCounterKey(pair.metricKey.keyType)) {
      sendDeltaMetricToSentry(pair, previousCounterValues);
    } else {
      sendMetricToSentry(pair);
    }
  });
}

/**
 * Creates a metrics flusher with its own isolated state for delta tracking.
 * Useful for testing scenarios where you need to control the lifecycle.
 * @internal
 */
export function createMetricsFlusher(): {
  flush: () => void;
  clear: () => void;
} {
  const previousCounterValues = new Map<string, number>();
  return {
    flush: () => flushMetricsToSentry(previousCounterValues),
    clear: () => previousCounterValues.clear(),
  };
}

function createMetricsReporterEffect(previousCounterValues: Map<string, number>): Effect.Effect<void, never, never> {
  const schedule = Schedule.spaced('10 seconds');

  return Effect.repeat(
    Effect.sync(() => flushMetricsToSentry(previousCounterValues)),
    schedule,
  ).pipe(Effect.asVoid, Effect.interruptible);
}

/**
 * Effect Layer that periodically flushes metrics to Sentry.
 * The layer manages its own state for delta counter calculations,
 * which is automatically cleaned up when the layer is finalized.
 */
export const SentryEffectMetricsLayer: Layer.Layer<never, never, never> = scopedDiscard(
  Effect.gen(function* () {
    const previousCounterValues = new Map<string, number>();

    yield* Effect.acquireRelease(Effect.void, () =>
      Effect.sync(() => {
        previousCounterValues.clear();
      }),
    );

    yield* Effect.forkScoped(createMetricsReporterEffect(previousCounterValues));
  }),
);
