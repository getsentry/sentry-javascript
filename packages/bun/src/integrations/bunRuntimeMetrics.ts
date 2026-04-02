import { performance } from 'perf_hooks';
import { _INTERNAL_safeDateNow, _INTERNAL_safeUnref, defineIntegration, metrics } from '@sentry/core';
import type { NodeRuntimeMetricsOptions } from '@sentry/node';

const INTEGRATION_NAME = 'BunRuntimeMetrics';
const DEFAULT_INTERVAL_MS = 30_000;
const MIN_COLLECTION_INTERVAL_MS = 1_000;

/**
 * Which metrics to collect in the Bun runtime metrics integration.
 * Explicitly picks the metrics available in Bun from `NodeRuntimeMetricsOptions['collect']`.
 * Event loop delay percentiles are excluded because `monitorEventLoopDelay` is unavailable in Bun.
 */
type BunCollectOptions = Pick<
  NonNullable<NodeRuntimeMetricsOptions['collect']>,
  | 'cpuUtilization'
  | 'cpuTime'
  | 'memHeapUsed'
  | 'memHeapTotal'
  | 'memRss'
  | 'memExternal'
  | 'eventLoopUtilization'
  | 'uptime'
>;

export interface BunRuntimeMetricsOptions {
  /**
   * Which metrics to collect.
   *
   * Default on (6 metrics):
   * - `cpuUtilization` — CPU utilization ratio
   * - `memRss` — Resident Set Size (actual memory footprint)
   * - `memHeapUsed` — V8 heap currently in use
   * - `memHeapTotal` — total V8 heap allocated
   * - `eventLoopUtilization` — fraction of time the event loop was active
   * - `uptime` — process uptime (detect restarts/crashes)
   *
   * Default off (opt-in):
   * - `cpuTime` — raw user/system CPU time in seconds
   * - `memExternal` — external/ArrayBuffer memory (relevant for native addons)
   *
   * Note: event loop delay percentiles (p50, p99, etc.) are not available in Bun
   * because `monitorEventLoopDelay` from `perf_hooks` is not implemented.
   */
  collect?: BunCollectOptions;
  /**
   * How often to collect metrics, in milliseconds.
   * Minimum allowed value is 1000ms.
   * @default 30000
   * @minimum 1000
   */
  collectionIntervalMs?: number;
}

/**
 * Automatically collects Bun runtime metrics and emits them to Sentry.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [
 *     Sentry.bunRuntimeMetricsIntegration(),
 *   ],
 * });
 * ```
 */
export const bunRuntimeMetricsIntegration = defineIntegration((options: BunRuntimeMetricsOptions = {}) => {
  const rawInterval = options.collectionIntervalMs ?? DEFAULT_INTERVAL_MS;
  if (!Number.isFinite(rawInterval) || rawInterval < MIN_COLLECTION_INTERVAL_MS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] ${INTEGRATION_NAME}: collectionIntervalMs (${rawInterval}) is below the minimum of ${MIN_COLLECTION_INTERVAL_MS}ms. Using minimum of ${MIN_COLLECTION_INTERVAL_MS}ms.`,
    );
  }
  const collectionIntervalMs = Number.isFinite(rawInterval)
    ? Math.max(rawInterval, MIN_COLLECTION_INTERVAL_MS)
    : MIN_COLLECTION_INTERVAL_MS;
  const collect = {
    // Default on
    cpuUtilization: true,
    memHeapUsed: true,
    memHeapTotal: true,
    memRss: true,
    eventLoopUtilization: true,
    uptime: true,
    // Default off
    cpuTime: false,
    memExternal: false,
    ...options.collect,
  };

  const needsCpu = collect.cpuUtilization || collect.cpuTime;

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let prevCpuUsage: NodeJS.CpuUsage | undefined;
  let prevElu: ReturnType<typeof performance.eventLoopUtilization> | undefined;
  let prevFlushTime: number = 0;
  let eluAvailable = false;

  const METRIC_ATTRIBUTES = { attributes: { 'sentry.origin': 'auto.bun.runtime_metrics' } };
  const METRIC_ATTRIBUTES_BYTE = { unit: 'byte', attributes: { 'sentry.origin': 'auto.bun.runtime_metrics' } };
  const METRIC_ATTRIBUTES_SECOND = { unit: 'second', attributes: { 'sentry.origin': 'auto.bun.runtime_metrics' } };

  function collectMetrics(): void {
    const now = _INTERNAL_safeDateNow();
    const elapsed = now - prevFlushTime;

    if (needsCpu && prevCpuUsage !== undefined) {
      const delta = process.cpuUsage(prevCpuUsage);

      if (collect.cpuTime) {
        metrics.gauge('bun.runtime.cpu.user', delta.user / 1e6, METRIC_ATTRIBUTES_SECOND);
        metrics.gauge('bun.runtime.cpu.system', delta.system / 1e6, METRIC_ATTRIBUTES_SECOND);
      }
      if (collect.cpuUtilization && elapsed > 0) {
        metrics.gauge('bun.runtime.cpu.utilization', (delta.user + delta.system) / (elapsed * 1000), METRIC_ATTRIBUTES);
      }

      prevCpuUsage = process.cpuUsage();
    }

    if (collect.memRss || collect.memHeapUsed || collect.memHeapTotal || collect.memExternal) {
      const mem = process.memoryUsage();
      if (collect.memRss) {
        metrics.gauge('bun.runtime.mem.rss', mem.rss, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapUsed) {
        metrics.gauge('bun.runtime.mem.heap_used', mem.heapUsed, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapTotal) {
        metrics.gauge('bun.runtime.mem.heap_total', mem.heapTotal, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memExternal) {
        metrics.gauge('bun.runtime.mem.external', mem.external, METRIC_ATTRIBUTES_BYTE);
        metrics.gauge('bun.runtime.mem.array_buffers', mem.arrayBuffers, METRIC_ATTRIBUTES_BYTE);
      }
    }

    if (collect.eventLoopUtilization && eluAvailable && prevElu !== undefined) {
      const currentElu = performance.eventLoopUtilization();
      const delta = performance.eventLoopUtilization(currentElu, prevElu);
      metrics.gauge('bun.runtime.event_loop.utilization', delta.utilization, METRIC_ATTRIBUTES);
      prevElu = currentElu;
    }

    if (collect.uptime && elapsed > 0) {
      metrics.count('bun.runtime.process.uptime', elapsed / 1000, METRIC_ATTRIBUTES_SECOND);
    }

    prevFlushTime = now;
  }

  return {
    name: INTEGRATION_NAME,

    setup(): void {
      // Prime baselines before the first collection interval.
      if (needsCpu) {
        prevCpuUsage = process.cpuUsage();
      }
      if (collect.eventLoopUtilization) {
        try {
          prevElu = performance.eventLoopUtilization();
          eluAvailable = true;
        } catch {
          // Not available in all Bun versions.
        }
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
