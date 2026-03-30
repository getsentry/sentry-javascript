import { _INTERNAL_safeDateNow, defineIntegration, metrics } from '@sentry/core';

const INTEGRATION_NAME = 'DenoRuntimeMetrics';
const DEFAULT_INTERVAL_MS = 30_000;

export interface DenoRuntimeMetricsOptions {
  /**
   * Which metrics to collect.
   *
   * Default on (4 metrics):
   * - `memRss` — Resident Set Size (actual memory footprint)
   * - `memHeapUsed` — V8 heap currently in use
   * - `memHeapTotal` — total V8 heap allocated
   * - `uptime` — process uptime (detect restarts/crashes)
   *
   * Default off (opt-in):
   * - `memExternal` — external memory (JS objects outside the V8 isolate)
   *
   * Note: CPU utilization and event loop metrics are not available in Deno.
   */
  collect?: {
    memRss?: boolean;
    memHeapUsed?: boolean;
    memHeapTotal?: boolean;
    memExternal?: boolean;
    uptime?: boolean;
  };
  /**
   * How often to collect metrics, in milliseconds.
   * @default 30000
   */
  collectionIntervalMs?: number;
}

/**
 * Automatically collects Deno runtime metrics and emits them to Sentry.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [
 *     Sentry.denoRuntimeMetricsIntegration(),
 *   ],
 * });
 * ```
 */
export const denoRuntimeMetricsIntegration = defineIntegration((options: DenoRuntimeMetricsOptions = {}) => {
  const collectionIntervalMs = options.collectionIntervalMs ?? DEFAULT_INTERVAL_MS;
  const collect = {
    // Default on
    memRss: true,
    memHeapUsed: true,
    memHeapTotal: true,
    uptime: true,
    // Default off
    memExternal: false,
    ...options.collect,
  };

  let intervalId: number | undefined;
  let prevFlushTime: number = 0;

  const METRIC_ATTRIBUTES_BYTE = { unit: 'byte', attributes: { 'sentry.origin': 'auto.deno.runtime_metrics' } };
  const METRIC_ATTRIBUTES_SECOND = { unit: 'second', attributes: { 'sentry.origin': 'auto.deno.runtime_metrics' } };

  function collectMetrics(): void {
    const now = _INTERNAL_safeDateNow();
    const elapsed = now - prevFlushTime;

    if (collect.memRss || collect.memHeapUsed || collect.memHeapTotal || collect.memExternal) {
      const mem = Deno.memoryUsage();
      if (collect.memRss) {
        metrics.gauge('deno.runtime.mem.rss', mem.rss, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapUsed) {
        metrics.gauge('deno.runtime.mem.heap_used', mem.heapUsed, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapTotal) {
        metrics.gauge('deno.runtime.mem.heap_total', mem.heapTotal, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memExternal) {
        metrics.gauge('deno.runtime.mem.external', mem.external, METRIC_ATTRIBUTES_BYTE);
      }
    }

    if (collect.uptime && elapsed > 0) {
      metrics.count('deno.runtime.process.uptime', elapsed / 1000, METRIC_ATTRIBUTES_SECOND);
    }

    prevFlushTime = now;
  }

  return {
    name: INTEGRATION_NAME,

    setup(): void {
      prevFlushTime = _INTERNAL_safeDateNow();

      // Guard against double setup (e.g. re-init).
      if (intervalId) {
        clearInterval(intervalId);
      }
      intervalId = setInterval(collectMetrics, collectionIntervalMs);
      // In Deno, setInterval returns a number, so _INTERNAL_safeUnref is a no-op.
      // Use Deno.unrefTimer so the interval doesn't prevent the process from exiting.
      Deno.unrefTimer(intervalId);
    },

    teardown(): void {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },
  };
});
