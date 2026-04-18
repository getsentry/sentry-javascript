import { metrics as sentryMetrics } from '@sentry/core';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import * as Metric from 'effect/Metric';
import * as Schedule from 'effect/Schedule';

type MetricAttributes = Record<string, string>;

interface MetricLabel {
  key: string;
  value: string;
}

function labelsToAttributes(labels: ReadonlyArray<MetricLabel>): MetricAttributes {
  return labels.reduce((acc, label) => ({ ...acc, [label.key]: label.value }), {});
}

// Effect v3 metric pair structure
interface V3MetricPair {
  metricKey: {
    name: string;
    tags: ReadonlyArray<MetricLabel>;
    keyType: { _tag: string };
  };
  metricState: {
    _tag?: string;
    count?: number | bigint;
    value?: number;
    sum?: number;
    min?: number;
    max?: number;
    occurrences?: Map<string, number>;
  };
}

// Effect v4 metric snapshot structure
interface V4MetricSnapshot {
  id: string;
  type: 'Counter' | 'Gauge' | 'Frequency' | 'Histogram' | 'Summary';
  description?: string;
  attributes?: Readonly<Record<string, string>>;
  state: {
    count?: number | bigint;
    value?: number;
    sum?: number;
    min?: number;
    max?: number;
    occurrences?: ReadonlyMap<string, number>;
    incremental?: boolean;
  };
}

function getMetricIdV3(pair: V3MetricPair): string {
  const tags = pair.metricKey.tags.map(t => `${t.key}=${t.value}`).join(',');
  return `${pair.metricKey.name}:${tags}`;
}

function getMetricIdV4(snapshot: V4MetricSnapshot): string {
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

  const stateTag = metricState._tag;

  if (stateTag === 'CounterState') {
    const currentValue = Number(metricState.count);
    const previousValue = previousCounterValues.get(metricId) ?? 0;
    const delta = currentValue - previousValue;

    if (delta > 0) {
      sentryMetrics.count(name, delta, { attributes });
    }

    previousCounterValues.set(metricId, currentValue);
  } else if (stateTag === 'GaugeState') {
    const value = Number(metricState.value);
    sentryMetrics.gauge(name, value, { attributes });
  } else if (stateTag === 'HistogramState' || stateTag === 'SummaryState') {
    sentryMetrics.gauge(`${name}.sum`, metricState.sum ?? 0, { attributes });
    sentryMetrics.gauge(`${name}.count`, metricState.count ? Number(metricState.count) : 0, { attributes });
    sentryMetrics.gauge(`${name}.min`, metricState.min ?? 0, { attributes });
    sentryMetrics.gauge(`${name}.max`, metricState.max ?? 0, { attributes });
  } else if (stateTag === 'FrequencyState' && metricState.occurrences) {
    for (const [word, count] of metricState.occurrences) {
      sentryMetrics.count(name, count, {
        attributes: { ...attributes, word },
      });
    }
  }
}

function sendV4MetricToSentry(snapshot: V4MetricSnapshot, previousCounterValues: Map<string, number>): void {
  const name = snapshot.id;
  const attributes: MetricAttributes = snapshot.attributes ? { ...snapshot.attributes } : {};
  const metricId = getMetricIdV4(snapshot);

  if (snapshot.type === 'Counter') {
    const currentValue = Number(snapshot.state.count);
    const previousValue = previousCounterValues.get(metricId) ?? 0;
    const delta = currentValue - previousValue;

    if (delta > 0) {
      sentryMetrics.count(name, delta, { attributes });
    }

    previousCounterValues.set(metricId, currentValue);
  } else if (snapshot.type === 'Gauge') {
    const value = Number(snapshot.state.value);
    sentryMetrics.gauge(name, value, { attributes });
  } else if (snapshot.type === 'Histogram' || snapshot.type === 'Summary') {
    sentryMetrics.gauge(`${name}.sum`, snapshot.state.sum ?? 0, { attributes });
    sentryMetrics.gauge(`${name}.count`, snapshot.state.count ? Number(snapshot.state.count) : 0, { attributes });
    sentryMetrics.gauge(`${name}.min`, snapshot.state.min ?? 0, { attributes });
    sentryMetrics.gauge(`${name}.max`, snapshot.state.max ?? 0, { attributes });
  } else if (snapshot.type === 'Frequency' && snapshot.state.occurrences) {
    for (const [word, count] of snapshot.state.occurrences) {
      sentryMetrics.count(name, count, {
        attributes: { ...attributes, word },
      });
    }
  }
}

// Use bracket notation to avoid Webpack static analysis flagging missing exports
// oxlint-disable-next-line typescript-eslint(no-explicit-any)
const MetricModule: Record<string, unknown> = Metric as Record<string, unknown>;

// Runtime check for Effect version
const hasSnapshotUnsafe = typeof MetricModule['snapshotUnsafe'] === 'function';
const hasUnsafeSnapshot = typeof MetricModule['unsafeSnapshot'] === 'function';

function flushMetricsToSentry(previousCounterValues: Map<string, number>): void {
  let snapshots: unknown[];

  if (hasSnapshotUnsafe) {
    // Effect v4
    snapshots = (MetricModule['snapshotUnsafe'] as (ctx: Context.Context<never>) => unknown[])(Context.empty());
  } else if (hasUnsafeSnapshot) {
    // Effect v3
    snapshots = (MetricModule['unsafeSnapshot'] as () => unknown[])();
  } else {
    return;
  }

  for (const item of snapshots) {
    // Detect v4 vs v3 structure
    if (item && typeof item === 'object' && 'id' in item && 'type' in item && 'state' in item) {
      // v4 snapshot
      sendV4MetricToSentry(item as V4MetricSnapshot, previousCounterValues);
    } else if (item && typeof item === 'object' && 'metricKey' in item && 'metricState' in item) {
      // v3 metric pair
      sendV3MetricToSentry(item as V3MetricPair, previousCounterValues);
    }
  }
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
export const SentryEffectMetricsLayer: Layer.Layer<never, never, never> = Effect.gen(function* () {
  const previousCounterValues = new Map<string, number>();

  yield* Effect.acquireRelease(Effect.void, () =>
    Effect.sync(() => {
      previousCounterValues.clear();
    }),
  );

  yield* Effect.forkScoped(createMetricsReporterEffect(previousCounterValues));
}).pipe(Effect.asVoid, Effect.scoped) as unknown as Layer.Layer<never, never, never>;
