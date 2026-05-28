import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeRuntimeMetricsIntegration } from '../../src/integrations/nodeRuntimeMetrics';

const { mockGauge, mockCount } = vi.hoisted(() => ({ mockGauge: vi.fn(), mockCount: vi.fn() }));

const { mockHistogram, mockMonitorEventLoopDelay, mockPerformance } = vi.hoisted(() => {
  const mockHistogram = {
    min: 2_000_000,
    max: 20_000_000,
    mean: 10_000_000,
    percentile: vi.fn((p: number) => {
      if (p === 50) return 8_000_000;
      if (p === 90) return 15_000_000;
      if (p === 99) return 19_000_000;
      return 0;
    }),
    enable: vi.fn(),
    reset: vi.fn(),
    disable: vi.fn(),
  };

  const mockMonitorEventLoopDelay = vi.fn(() => mockHistogram);
  const mockElu = { idle: 700, active: 300, utilization: 0.3 };
  const mockEluDelta = { idle: 700, active: 300, utilization: 0.3 };
  const mockPerformance = {
    eventLoopUtilization: vi.fn((curr?: object, _prev?: object) => {
      if (curr) return mockEluDelta;
      return mockElu;
    }),
  };

  return { mockHistogram, mockMonitorEventLoopDelay, mockPerformance };
});

vi.mock('perf_hooks', () => ({
  monitorEventLoopDelay: mockMonitorEventLoopDelay,
  performance: mockPerformance,
}));

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return { ...actual, metrics: { ...actual.metrics, gauge: mockGauge, count: mockCount } };
});

describe('nodeRuntimeMetricsIntegration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGauge.mockClear();
    mockCount.mockClear();

    vi.spyOn(process, 'cpuUsage').mockReturnValue({ user: 500_000, system: 200_000 });
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 50_000_000,
      heapTotal: 30_000_000,
      heapUsed: 20_000_000,
      external: 1_000_000,
      arrayBuffers: 500_000,
    });

    mockHistogram.percentile.mockClear();
    mockHistogram.enable.mockClear();
    mockHistogram.reset.mockClear();
    mockMonitorEventLoopDelay.mockClear();
    mockPerformance.eventLoopUtilization.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('has the correct name', () => {
    const integration = nodeRuntimeMetricsIntegration();
    expect(integration.name).toBe('NodeRuntimeMetrics');
  });

  describe('setup', () => {
    it('initializes event loop delay histogram with resolution 10', () => {
      const integration = nodeRuntimeMetricsIntegration();
      integration.setup();

      expect(mockMonitorEventLoopDelay).toHaveBeenCalledWith({ resolution: 10 });
      expect(mockHistogram.enable).toHaveBeenCalledOnce();
    });

    it('does not throw if monitorEventLoopDelay is unavailable (e.g. Bun)', () => {
      mockMonitorEventLoopDelay.mockImplementationOnce(() => {
        throw new Error('NotImplementedError');
      });

      const integration = nodeRuntimeMetricsIntegration();
      expect(() => integration.setup()).not.toThrow();
    });

    it('starts a collection interval', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();

      expect(mockGauge).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1_000);
      expect(mockGauge).toHaveBeenCalled();
    });
  });

  const ORIGIN = { attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };
  const BYTE = { unit: 'byte', attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };
  const SECOND = { unit: 'second', attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };

  describe('metric collection — defaults', () => {
    it('emits cpu utilization (default on)', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).toHaveBeenCalledWith('node.runtime.cpu.utilization', expect.any(Number), ORIGIN);
    });

    it('does not emit cpu.user / cpu.system by default (opt-in)', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).not.toHaveBeenCalledWith('node.runtime.cpu.user', expect.anything(), expect.anything());
      expect(mockGauge).not.toHaveBeenCalledWith('node.runtime.cpu.system', expect.anything(), expect.anything());
    });

    it('emits cpu.user / cpu.system when cpuTime is opted in', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { cpuTime: true },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).toHaveBeenCalledWith('node.runtime.cpu.user', expect.any(Number), SECOND);
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.cpu.system', expect.any(Number), SECOND);
    });

    it('emits mem.rss, mem.heap_used, mem.heap_total (default on)', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).toHaveBeenCalledWith('node.runtime.mem.rss', 50_000_000, BYTE);
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.mem.heap_used', 20_000_000, BYTE);
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.mem.heap_total', 30_000_000, BYTE);
    });

    it('does not emit mem.external / mem.array_buffers by default (opt-in)', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).not.toHaveBeenCalledWith('node.runtime.mem.external', expect.anything(), expect.anything());
      expect(mockGauge).not.toHaveBeenCalledWith(
        'node.runtime.mem.array_buffers',
        expect.anything(),
        expect.anything(),
      );
    });

    it('emits mem.external / mem.array_buffers when opted in', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { memExternal: true },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).toHaveBeenCalledWith('node.runtime.mem.external', 1_000_000, BYTE);
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.mem.array_buffers', 500_000, BYTE);
    });

    it('emits event_loop.delay.p50 and p99 (default on) and resets histogram', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.delay.p50', expect.any(Number), SECOND);
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.delay.p99', expect.any(Number), SECOND);
      expect(mockHistogram.reset).toHaveBeenCalledOnce();
    });

    it('does not emit min/max/mean/p90 event loop delay by default (opt-in)', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      for (const suffix of ['min', 'max', 'mean', 'p90']) {
        expect(mockGauge).not.toHaveBeenCalledWith(
          `node.runtime.event_loop.delay.${suffix}`,
          expect.anything(),
          expect.anything(),
        );
      }
    });

    it('emits all opt-in event loop delay percentiles when enabled', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: {
          eventLoopDelayMin: true,
          eventLoopDelayMax: true,
          eventLoopDelayMean: true,
          eventLoopDelayP90: true,
        },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      // min: (2_000_000 - 10_000_000) clamped to 0 → 0s
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.delay.min', 0, SECOND);
      // max: (20_000_000 - 10_000_000) / 1e9 → 0.01s
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.delay.max', 0.01, SECOND);
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.delay.mean', 0, SECOND);
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.delay.p90', expect.any(Number), SECOND);
    });

    it('emits event loop utilization metric', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.utilization', 0.3, ORIGIN);
    });

    it('emits uptime counter', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockCount).toHaveBeenCalledWith('node.runtime.process.uptime', expect.any(Number), SECOND);
    });

    it('does not emit event loop delay metrics if monitorEventLoopDelay threw', () => {
      mockMonitorEventLoopDelay.mockImplementationOnce(() => {
        throw new Error('NotImplementedError');
      });

      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).not.toHaveBeenCalledWith(
        'node.runtime.event_loop.delay.p99',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('opt-out', () => {
    it('skips cpu.utilization when cpuUtilization is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { cpuUtilization: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).not.toHaveBeenCalledWith('node.runtime.cpu.utilization', expect.anything(), expect.anything());
    });

    it('skips mem.rss when memRss is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { memRss: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).not.toHaveBeenCalledWith('node.runtime.mem.rss', expect.anything(), expect.anything());
    });

    it('skips event loop delay metrics when all delay flags are false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { eventLoopDelayP50: false, eventLoopDelayP99: false },
      });
      integration.setup();

      expect(mockMonitorEventLoopDelay).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1_000);
      for (const suffix of ['min', 'max', 'mean', 'p50', 'p90', 'p99']) {
        expect(mockGauge).not.toHaveBeenCalledWith(
          `node.runtime.event_loop.delay.${suffix}`,
          expect.anything(),
          expect.anything(),
        );
      }
    });

    it('skips only p99 but still emits p50 when eventLoopDelayP99 is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { eventLoopDelayP99: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).not.toHaveBeenCalledWith(
        'node.runtime.event_loop.delay.p99',
        expect.anything(),
        expect.anything(),
      );
      expect(mockGauge).toHaveBeenCalledWith('node.runtime.event_loop.delay.p50', expect.any(Number), SECOND);
    });

    it('skips event loop utilization when eventLoopUtilization is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { eventLoopUtilization: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockGauge).not.toHaveBeenCalledWith(
        'node.runtime.event_loop.utilization',
        expect.anything(),
        expect.anything(),
      );
    });

    it('skips uptime when uptime is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { uptime: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(mockCount).not.toHaveBeenCalledWith('node.runtime.process.uptime', expect.anything(), expect.anything());
    });

    it('enforces minimum collectionIntervalMs of 1000ms and warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 100 });
      integration.setup();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('collectionIntervalMs'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1000'));

      // Should fire at the minimum 1000ms, not at 100ms
      vi.advanceTimersByTime(100);
      expect(mockGauge).not.toHaveBeenCalled();

      vi.advanceTimersByTime(900);
      expect(mockGauge).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('falls back to default when collectionIntervalMs is NaN', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: NaN });
      integration.setup();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('collectionIntervalMs'));

      // Should fire at the default 30000ms, not at 1000ms
      vi.advanceTimersByTime(1000);
      expect(mockGauge).not.toHaveBeenCalled();

      vi.advanceTimersByTime(29_000);
      expect(mockGauge).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
