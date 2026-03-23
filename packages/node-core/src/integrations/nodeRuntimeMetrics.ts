import { monitorEventLoopDelay, performance } from 'perf_hooks';
import { defineIntegration, flushIfServerless, metrics, safeDateNow } from '@sentry/core';

const INTEGRATION_NAME = 'NodeRuntimeMetrics';
const DEFAULT_INTERVAL_MS = 30_000;

export interface NodeRuntimeMetricsOptions {
  /**
   * Which metric groups to collect. All groups are enabled by default.
   */
  collect?: {
    cpu?: boolean;
    memory?: boolean;
    eventLoopDelay?: boolean;
    eventLoopUtilization?: boolean;
    uptime?: boolean;
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
    cpu: true,
    memory: true,
    eventLoopDelay: true,
    eventLoopUtilization: true,
    uptime: true,
    ...options.collect,
  };

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let prevCpuUsage: NodeJS.CpuUsage | undefined;
  let prevElu: ReturnType<typeof performance.eventLoopUtilization> | undefined;
  let prevFlushTime: number;
  let eventLoopDelayHistogram: ReturnType<typeof monitorEventLoopDelay> | undefined;

  function collectMetrics(): void {
    const now = safeDateNow();
    const elapsed = now - prevFlushTime;

    if (collect.cpu && prevCpuUsage !== undefined) {
      const delta = process.cpuUsage(prevCpuUsage);
      metrics.gauge('node.runtime.cpu.user', delta.user / 1e6, { unit: 'second' });
      metrics.gauge('node.runtime.cpu.system', delta.system / 1e6, { unit: 'second' });
      if (elapsed > 0) {
        // Ratio of CPU time to wall-clock time. Can exceed 1.0 on multi-core systems.
        // TODO: In cluster mode, add a runtime_id/process_id attribute to disambiguate per-worker metrics.
        metrics.gauge('node.runtime.cpu.utilization', (delta.user + delta.system) / (elapsed * 1000));
      }
      prevCpuUsage = process.cpuUsage();
    }

    if (collect.memory) {
      const mem = process.memoryUsage();
      metrics.gauge('node.runtime.mem.rss', mem.rss, { unit: 'byte' });
      metrics.gauge('node.runtime.mem.heap_total', mem.heapTotal, { unit: 'byte' });
      metrics.gauge('node.runtime.mem.heap_used', mem.heapUsed, { unit: 'byte' });
      metrics.gauge('node.runtime.mem.external', mem.external, { unit: 'byte' });
      metrics.gauge('node.runtime.mem.array_buffers', mem.arrayBuffers, { unit: 'byte' });
    }

    if (collect.eventLoopDelay && eventLoopDelayHistogram) {
      // Resolution is 10ms (10_000_000 ns) as configured below. Subtract it to normalize out sampling overhead.
      const resolutionNs = 10_000_000;
      const nsToS = (ns: number): number => Math.max(0, (ns - resolutionNs) / 1e9);

      metrics.gauge('node.runtime.event_loop.delay.min', nsToS(eventLoopDelayHistogram.min), { unit: 'second' });
      metrics.gauge('node.runtime.event_loop.delay.max', nsToS(eventLoopDelayHistogram.max), { unit: 'second' });
      metrics.gauge('node.runtime.event_loop.delay.mean', nsToS(eventLoopDelayHistogram.mean), { unit: 'second' });
      metrics.gauge('node.runtime.event_loop.delay.p50', nsToS(eventLoopDelayHistogram.percentile(50)), {
        unit: 'second',
      });
      metrics.gauge('node.runtime.event_loop.delay.p90', nsToS(eventLoopDelayHistogram.percentile(90)), {
        unit: 'second',
      });
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
      if (collect.eventLoopDelay) {
        try {
          eventLoopDelayHistogram = monitorEventLoopDelay({ resolution: 10 });
          eventLoopDelayHistogram.enable();
        } catch {
          // Not available in all runtimes (e.g. Bun throws NotImplementedError).
        }
      }

      // Prime baselines before the first collection interval.
      if (collect.cpu) {
        prevCpuUsage = process.cpuUsage();
      }
      if (collect.eventLoopUtilization) {
        prevElu = performance.eventLoopUtilization();
      }
      prevFlushTime = safeDateNow();

      // Guard against double setup (e.g. re-init).
      if (intervalId) {
        clearInterval(intervalId);
      }
      intervalId = setInterval(collectMetrics, collectionIntervalMs);
      // Do not keep the process alive solely for metric collection.
      intervalId.unref();

      // Collect and flush at the end of every invocation. In non-serverless environments
      // flushIfServerless is a no-op, so this is safe to call unconditionally.
      process.once('beforeExit', () => {
        collectMetrics();
        void flushIfServerless();
      });
    },
  };
});
