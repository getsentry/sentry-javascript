import { monitorEventLoopDelay, performance } from 'perf_hooks';
import { _INTERNAL_safeDateNow, defineIntegration, flushIfServerless, metrics } from '@sentry/core';

const INTEGRATION_NAME = 'NodeRuntimeMetrics';
const DEFAULT_INTERVAL_MS = 30_000;
const EVENT_LOOP_DELAY_RESOLUTION_MS = 10;

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
   * @default 30000
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
  const collectionIntervalMs = options.collectionIntervalMs ?? DEFAULT_INTERVAL_MS;
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
  let beforeExitListener: (() => void) | undefined;
  let prevCpuUsage: NodeJS.CpuUsage | undefined;
  let prevElu: ReturnType<typeof performance.eventLoopUtilization> | undefined;
  let prevFlushTime: number = 0;
  let eventLoopDelayHistogram: ReturnType<typeof monitorEventLoopDelay> | undefined;

  const resolutionNs = EVENT_LOOP_DELAY_RESOLUTION_MS * 1e6;
  const nsToS = (ns: number): number => Math.max(0, (ns - resolutionNs) / 1e9);

  function collectMetrics(): void {
    const now = _INTERNAL_safeDateNow();
    const elapsed = now - prevFlushTime;

    if (needsCpu && prevCpuUsage !== undefined) {
      const delta = process.cpuUsage(prevCpuUsage);

      if (collect.cpuTime) {
        metrics.gauge('node.runtime.cpu.user', delta.user / 1e6, { unit: 'second' });
        metrics.gauge('node.runtime.cpu.system', delta.system / 1e6, { unit: 'second' });
      }
      if (collect.cpuUtilization && elapsed > 0) {
        // Ratio of CPU time to wall-clock time. Can exceed 1.0 on multi-core systems.
        // TODO: In cluster mode, add a runtime_id/process_id attribute to disambiguate per-worker metrics.
        metrics.gauge('node.runtime.cpu.utilization', (delta.user + delta.system) / (elapsed * 1000));
      }

      prevCpuUsage = process.cpuUsage();
    }

    if (collect.memRss || collect.memHeapUsed || collect.memHeapTotal || collect.memExternal) {
      const mem = process.memoryUsage();
      if (collect.memRss) metrics.gauge('node.runtime.mem.rss', mem.rss, { unit: 'byte' });
      if (collect.memHeapUsed) metrics.gauge('node.runtime.mem.heap_used', mem.heapUsed, { unit: 'byte' });
      if (collect.memHeapTotal) metrics.gauge('node.runtime.mem.heap_total', mem.heapTotal, { unit: 'byte' });
      if (collect.memExternal) {
        metrics.gauge('node.runtime.mem.external', mem.external, { unit: 'byte' });
        metrics.gauge('node.runtime.mem.array_buffers', mem.arrayBuffers, { unit: 'byte' });
      }
    }

    if (needsEventLoopDelay && eventLoopDelayHistogram) {
      if (collect.eventLoopDelayMin)
        metrics.gauge('node.runtime.event_loop.delay.min', nsToS(eventLoopDelayHistogram.min), { unit: 'second' });
      if (collect.eventLoopDelayMax)
        metrics.gauge('node.runtime.event_loop.delay.max', nsToS(eventLoopDelayHistogram.max), { unit: 'second' });
      if (collect.eventLoopDelayMean)
        metrics.gauge('node.runtime.event_loop.delay.mean', nsToS(eventLoopDelayHistogram.mean), { unit: 'second' });
      if (collect.eventLoopDelayP50)
        metrics.gauge('node.runtime.event_loop.delay.p50', nsToS(eventLoopDelayHistogram.percentile(50)), {
          unit: 'second',
        });
      if (collect.eventLoopDelayP90)
        metrics.gauge('node.runtime.event_loop.delay.p90', nsToS(eventLoopDelayHistogram.percentile(90)), {
          unit: 'second',
        });
      if (collect.eventLoopDelayP99)
        metrics.gauge('node.runtime.event_loop.delay.p99', nsToS(eventLoopDelayHistogram.percentile(99)), {
          unit: 'second',
        });

      eventLoopDelayHistogram.reset();
    }

    if (collect.eventLoopUtilization && prevElu !== undefined) {
      const currentElu = performance.eventLoopUtilization();
      const delta = performance.eventLoopUtilization(currentElu, prevElu);
      metrics.gauge('node.runtime.event_loop.utilization', delta.utilization);
      prevElu = currentElu;
    }

    if (collect.uptime && elapsed > 0) {
      metrics.count('node.runtime.process.uptime', elapsed / 1000, { unit: 'second' });
    }

    prevFlushTime = now;
  }

  return {
    name: INTEGRATION_NAME,

    setup(): void {
      if (needsEventLoopDelay) {
        try {
          eventLoopDelayHistogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_DELAY_RESOLUTION_MS });
          eventLoopDelayHistogram.enable();
        } catch {
          // Not available in all runtimes (e.g. Bun throws NotImplementedError).
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

      // Guard against double setup (e.g. re-init): clean up previous resources.
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (beforeExitListener) {
        process.off('beforeExit', beforeExitListener);
      }

      intervalId = setInterval(collectMetrics, collectionIntervalMs);
      // Do not keep the process alive solely for metric collection.
      intervalId.unref();

      // Collect and flush at the end of every invocation. Uses process.on (not once) so
      // that serverless warm starts (e.g. Lambda) trigger a flush on every invocation.
      // In non-serverless environments flushIfServerless is a no-op.
      beforeExitListener = () => {
        collectMetrics();
        void flushIfServerless();
      };
      process.on('beforeExit', beforeExitListener);
    },
  };
});
