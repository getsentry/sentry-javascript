import { monitorEventLoopDelay, performance } from 'perf_hooks';
import { _INTERNAL_safeDateNow, _INTERNAL_safeUnref, defineIntegration, metrics } from '@sentry/core';

const INTEGRATION_NAME = 'NodeRuntimeMetrics';
const DEFAULT_INTERVAL_MS = 30_000;
const MIN_COLLECTION_INTERVAL_MS = 1_000;
const EVENT_LOOP_DELAY_RESOLUTION_MS = 10;

/**
 * Normalizes a `collectionIntervalMs` value, enforcing a minimum of 1000ms.
 * Warns if the value is below the minimum or non-finite (e.g. NaN).
 * @internal
 */
export function _INTERNAL_normalizeCollectionInterval(rawInterval: number, integrationName: string): number {
  if (!Number.isFinite(rawInterval) || rawInterval < MIN_COLLECTION_INTERVAL_MS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] ${integrationName}: collectionIntervalMs (${rawInterval}) is below the minimum of ${MIN_COLLECTION_INTERVAL_MS}ms. Using minimum of ${MIN_COLLECTION_INTERVAL_MS}ms.`,
    );
  }
  return Number.isFinite(rawInterval) ? Math.max(rawInterval, MIN_COLLECTION_INTERVAL_MS) : MIN_COLLECTION_INTERVAL_MS;
}

export interface NodeRuntimeMetricsOptions {
  /**
   * Which metrics to collect.
   *
   * Default on (8 metrics):
   * - `cpuUtilization` — CPU utilization ratio
   * - `memRss` — Resident Set Size (actual memory footprint)
   * - `memHeapUsed` — V8 heap currently in use
   * - `memHeapTotal` — total V8 heap allocated (headroom paired with `memHeapUsed`)
   * - `eventLoopDelayP50` — median event loop delay (baseline latency)
   * - `eventLoopDelayP99` — 99th percentile event loop delay (tail latency / spikes)
   * - `eventLoopUtilization` — fraction of time the event loop was active
   * - `uptime` — process uptime (detect restarts/crashes)
   *
   * Default off (opt-in):
   * - `cpuTime` — raw user/system CPU time in seconds
   * - `memExternal` — external/ArrayBuffer memory (relevant for native addons)
   * - `eventLoopDelayMin` / `eventLoopDelayMax` / `eventLoopDelayMean` / `eventLoopDelayP90`
   */
  collect?: {
    // Default on
    cpuUtilization?: boolean;
    memHeapUsed?: boolean;
    memRss?: boolean;
    eventLoopDelayP99?: boolean;
    eventLoopUtilization?: boolean;
    uptime?: boolean;
    // Default off
    cpuTime?: boolean;
    memHeapTotal?: boolean;
    memExternal?: boolean;
    eventLoopDelayMin?: boolean;
    eventLoopDelayMax?: boolean;
    eventLoopDelayMean?: boolean;
    eventLoopDelayP50?: boolean;
    eventLoopDelayP90?: boolean;
  };
  /**
   * How often to collect metrics, in milliseconds.
   * Minimum allowed value is 1000ms.
   * @default 30000
   * @minimum 1000
   */
  collectionIntervalMs?: number;
}

/**
 * Automatically collects Node.js runtime metrics and emits them to Sentry.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [
 *     Sentry.nodeRuntimeMetricsIntegration(),
 *   ],
 * });
 * ```
 */
export const nodeRuntimeMetricsIntegration = defineIntegration((options: NodeRuntimeMetricsOptions = {}) => {
  const collectionIntervalMs = _INTERNAL_normalizeCollectionInterval(
    options.collectionIntervalMs ?? DEFAULT_INTERVAL_MS,
    INTEGRATION_NAME,
  );
  const collect = {
    // Default on
    cpuUtilization: true,
    memHeapUsed: true,
    memHeapTotal: true,
    memRss: true,
    eventLoopDelayP50: true,
    eventLoopDelayP99: true,
    eventLoopUtilization: true,
    uptime: true,
    // Default off
    cpuTime: false,
    memExternal: false,
    eventLoopDelayMin: false,
    eventLoopDelayMax: false,
    eventLoopDelayMean: false,
    eventLoopDelayP90: false,
    ...options.collect,
  };

  const needsEventLoopDelay =
    collect.eventLoopDelayP99 ||
    collect.eventLoopDelayMin ||
    collect.eventLoopDelayMax ||
    collect.eventLoopDelayMean ||
    collect.eventLoopDelayP50 ||
    collect.eventLoopDelayP90;

  const needsCpu = collect.cpuUtilization || collect.cpuTime;

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let prevCpuUsage: NodeJS.CpuUsage | undefined;
  let prevElu: ReturnType<typeof performance.eventLoopUtilization> | undefined;
  let prevFlushTime: number = 0;
  let eventLoopDelayHistogram: ReturnType<typeof monitorEventLoopDelay> | undefined;

  const resolutionNs = EVENT_LOOP_DELAY_RESOLUTION_MS * 1e6;
  const nsToS = (ns: number): number => Math.max(0, (ns - resolutionNs) / 1e9);

  const METRIC_ATTRIBUTES = { attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };
  const METRIC_ATTRIBUTES_BYTE = { unit: 'byte', attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };
  const METRIC_ATTRIBUTES_SECOND = { unit: 'second', attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };

  function collectMetrics(): void {
    const now = _INTERNAL_safeDateNow();
    const elapsed = now - prevFlushTime;

    if (needsCpu && prevCpuUsage !== undefined) {
      const delta = process.cpuUsage(prevCpuUsage);

      if (collect.cpuTime) {
        metrics.gauge('node.runtime.cpu.user', delta.user / 1e6, METRIC_ATTRIBUTES_SECOND);
        metrics.gauge('node.runtime.cpu.system', delta.system / 1e6, METRIC_ATTRIBUTES_SECOND);
      }
      if (collect.cpuUtilization && elapsed > 0) {
        // Ratio of CPU time to wall-clock time. Can exceed 1.0 on multi-core systems.
        // TODO: In cluster mode, add a runtime_id/process_id attribute to disambiguate per-worker metrics.
        metrics.gauge(
          'node.runtime.cpu.utilization',
          (delta.user + delta.system) / (elapsed * 1000),
          METRIC_ATTRIBUTES,
        );
      }

      prevCpuUsage = process.cpuUsage();
    }

    if (collect.memRss || collect.memHeapUsed || collect.memHeapTotal || collect.memExternal) {
      const mem = process.memoryUsage();
      if (collect.memRss) {
        metrics.gauge('node.runtime.mem.rss', mem.rss, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapUsed) {
        metrics.gauge('node.runtime.mem.heap_used', mem.heapUsed, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapTotal) {
        metrics.gauge('node.runtime.mem.heap_total', mem.heapTotal, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memExternal) {
        metrics.gauge('node.runtime.mem.external', mem.external, METRIC_ATTRIBUTES_BYTE);
        metrics.gauge('node.runtime.mem.array_buffers', mem.arrayBuffers, METRIC_ATTRIBUTES_BYTE);
      }
    }

    if (needsEventLoopDelay && eventLoopDelayHistogram) {
      if (collect.eventLoopDelayMin) {
        metrics.gauge(
          'node.runtime.event_loop.delay.min',
          nsToS(eventLoopDelayHistogram.min),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayMax) {
        metrics.gauge(
          'node.runtime.event_loop.delay.max',
          nsToS(eventLoopDelayHistogram.max),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayMean) {
        metrics.gauge(
          'node.runtime.event_loop.delay.mean',
          nsToS(eventLoopDelayHistogram.mean),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayP50) {
        metrics.gauge(
          'node.runtime.event_loop.delay.p50',
          nsToS(eventLoopDelayHistogram.percentile(50)),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayP90) {
        metrics.gauge(
          'node.runtime.event_loop.delay.p90',
          nsToS(eventLoopDelayHistogram.percentile(90)),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayP99) {
        metrics.gauge(
          'node.runtime.event_loop.delay.p99',
          nsToS(eventLoopDelayHistogram.percentile(99)),
          METRIC_ATTRIBUTES_SECOND,
        );
      }

      eventLoopDelayHistogram.reset();
    }

    if (collect.eventLoopUtilization && prevElu !== undefined) {
      const currentElu = performance.eventLoopUtilization();
      const delta = performance.eventLoopUtilization(currentElu, prevElu);
      metrics.gauge('node.runtime.event_loop.utilization', delta.utilization, METRIC_ATTRIBUTES);
      prevElu = currentElu;
    }

    if (collect.uptime && elapsed > 0) {
      metrics.count('node.runtime.process.uptime', elapsed / 1000, METRIC_ATTRIBUTES_SECOND);
    }

    prevFlushTime = now;
  }

  return {
    name: INTEGRATION_NAME,

    setup(): void {
      if (needsEventLoopDelay) {
        // Disable any previous histogram before overwriting (prevents native resource leak on re-init).
        eventLoopDelayHistogram?.disable();
        try {
          eventLoopDelayHistogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_DELAY_RESOLUTION_MS });
          eventLoopDelayHistogram.enable();
        } catch {
          // Not available in all runtimes (e.g. Bun throws NotImplementedError).
          eventLoopDelayHistogram = undefined;
        }
      }

      // Prime baselines before the first collection interval.
      if (needsCpu) {
        prevCpuUsage = process.cpuUsage();
      }
      if (collect.eventLoopUtilization) {
        prevElu = performance.eventLoopUtilization();
      }
      prevFlushTime = _INTERNAL_safeDateNow();

      // Guard against double setup (e.g. re-init).
      if (intervalId) {
        clearInterval(intervalId);
      }
      intervalId = _INTERNAL_safeUnref(setInterval(collectMetrics, collectionIntervalMs));
    },
  };
});
