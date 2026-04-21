import { metrics as sentryMetrics } from '@sentry/core';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Metric from 'effect/Metric';
import * as Schedule from 'effect/Schedule';

type MetricAttributes = Record<string, string>;

// =============================================================================
// Effect v3 Types (vendored - not exported from effect@3.x)
// =============================================================================

interface V3MetricLabel {
  key: string;
  value: string;
}

interface V3MetricPair {
  metricKey: {
    name: string;
    tags: ReadonlyArray<V3MetricLabel>;
    keyType: { _tag: string };
  };
  metricState: {
    count?: number | bigint;
    value?: number;
    sum?: number;
    min?: number;
    max?: number;
    occurrences?: Map<string, number>;
  };
}

// Effect v3 `MetricState` implementations brand themselves with a `Symbol.for(...)` TypeId
// rather than a string `_tag`. We use these globally-registered symbols to classify state
// instances returned by `Metric.unsafeSnapshot()` without importing `effect/MetricState`
// (the module does not exist in Effect v4).
const V3_COUNTER_STATE_TYPE_ID = Symbol.for('effect/MetricState/Counter');
const V3_GAUGE_STATE_TYPE_ID = Symbol.for('effect/MetricState/Gauge');
const V3_HISTOGRAM_STATE_TYPE_ID = Symbol.for('effect/MetricState/Histogram');
const V3_SUMMARY_STATE_TYPE_ID = Symbol.for('effect/MetricState/Summary');
const V3_FREQUENCY_STATE_TYPE_ID = Symbol.for('effect/MetricState/Frequency');

function labelsToAttributes(labels: ReadonlyArray<V3MetricLabel>): MetricAttributes {
  return labels.reduce((acc, label) => ({ ...acc, [label.key]: label.value }), {});
}

function getMetricIdV3(pair: V3MetricPair): string {
  const tags = pair.metricKey.tags.map(t => `${t.key}=${t.value}`).join(',');
  return `${pair.metricKey.name}:${tags}`;
}

function getMetricIdV4(snapshot: Metric.Metric.Snapshot): string {
  const attrs = snapshot.attributes
    ? Object.entries(snapshot.attributes)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : '';
  return `${snapshot.id}:${attrs}`;
}

function sendV3MetricToSentry(pair: V3MetricPair, previousCounterValues: Map<string, number>): void {
  const { metricKey, metricState } = pair;
  const name = metricKey.name;
  const attributes = labelsToAttributes(metricKey.tags);
  const metricId = getMetricIdV3(pair);

  const state = metricState as unknown as Record<symbol, unknown>;

  if (state[V3_COUNTER_STATE_TYPE_ID] !== undefined) {
    const currentValue = Number(metricState.count);
    const previousValue = previousCounterValues.get(metricId) ?? 0;
    const delta = currentValue - previousValue;

    if (delta > 0) {
      sentryMetrics.count(name, delta, { attributes });
    }

    previousCounterValues.set(metricId, currentValue);
  } else if (state[V3_GAUGE_STATE_TYPE_ID] !== undefined) {
    const value = Number(metricState.value);
    sentryMetrics.gauge(name, value, { attributes });
  } else if (state[V3_HISTOGRAM_STATE_TYPE_ID] !== undefined || state[V3_SUMMARY_STATE_TYPE_ID] !== undefined) {
    sentryMetrics.gauge(`${name}.sum`, metricState.sum ?? 0, { attributes });
    sentryMetrics.gauge(`${name}.count`, Number(metricState.count ?? 0), { attributes });
    sentryMetrics.gauge(`${name}.min`, metricState.min ?? 0, { attributes });
    sentryMetrics.gauge(`${name}.max`, metricState.max ?? 0, { attributes });
  } else if (state[V3_FREQUENCY_STATE_TYPE_ID] !== undefined && metricState.occurrences) {
    for (const [word, count] of metricState.occurrences) {
      sentryMetrics.count(name, count, {
        attributes: { ...attributes, word },
      });
    }
  }
}

function sendV4MetricToSentry(snapshot: Metric.Metric.Snapshot, previousCounterValues: Map<string, number>): void {
  const name = snapshot.id;
  const attributes: MetricAttributes = snapshot.attributes ? { ...snapshot.attributes } : {};
  const metricId = getMetricIdV4(snapshot);

  switch (snapshot.type) {
    case 'Counter': {
      const currentValue = Number(snapshot.state.count);
      const previousValue = previousCounterValues.get(metricId) ?? 0;
      const delta = currentValue - previousValue;

      if (delta > 0) {
        sentryMetrics.count(name, delta, { attributes });
      }

      previousCounterValues.set(metricId, currentValue);
      break;
    }
    case 'Gauge': {
      const value = Number(snapshot.state.value);
      sentryMetrics.gauge(name, value, { attributes });
      break;
    }
    case 'Histogram':
    case 'Summary': {
      sentryMetrics.gauge(`${name}.sum`, snapshot.state.sum ?? 0, { attributes });
      sentryMetrics.gauge(`${name}.count`, snapshot.state.count ?? 0, { attributes });
      sentryMetrics.gauge(`${name}.min`, snapshot.state.min ?? 0, { attributes });
      sentryMetrics.gauge(`${name}.max`, snapshot.state.max ?? 0, { attributes });
      break;
    }
    case 'Frequency': {
      for (const [word, count] of snapshot.state.occurrences) {
        sentryMetrics.count(name, count, {
          attributes: { ...attributes, word },
        });
      }
      break;
    }
  }
}

// =============================================================================
// Effect v3 snapshot function type (vendored - not exported from effect@3.x)
// =============================================================================

type V3UnsafeSnapshotFn = () => ReadonlyArray<V3MetricPair>;

// Use bracket notation to avoid Webpack static analysis flagging missing exports
// This is important for Effect v3 compatibility.
const MetricModule = Metric;
const snapshotUnsafe = MetricModule['snapshotUnsafe'] as typeof Metric.snapshotUnsafe | undefined;
// @ts-expect-error - unsafeSnapshot is not exported from effect@3.x
const unsafeSnapshot = MetricModule['unsafeSnapshot'] as V3UnsafeSnapshotFn | undefined;

function flushMetricsToSentry(previousCounterValues: Map<string, number>): void {
  if (snapshotUnsafe) {
    // Effect v4
    const snapshots = snapshotUnsafe(Context.empty());
    for (const snapshot of snapshots) {
      sendV4MetricToSentry(snapshot, previousCounterValues);
    }
  } else if (unsafeSnapshot) {
    // Effect v3
    const snapshots = unsafeSnapshot();
    for (const pair of snapshots) {
      sendV3MetricToSentry(pair, previousCounterValues);
    }
  }
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
export const SentryEffectMetricsLayer: Layer.Layer<never, never, never> = Layer.effectDiscard(
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
