import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metrics } from '@sentry/core';
import { nodeRuntimeMetricsIntegration } from '../../src/integrations/nodeRuntimeMetrics';

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
  return {
    ...actual,
    flushIfServerless: vi.fn(),
  };
});

describe('nodeRuntimeMetricsIntegration', () => {
  let gaugeSpy: ReturnType<typeof vi.spyOn>;
  let countSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    gaugeSpy = vi.spyOn(metrics, 'gauge');
    countSpy = vi.spyOn(metrics, 'count');

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

      expect(gaugeSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1_000);
      expect(gaugeSpy).toHaveBeenCalled();
    });
  });

  describe('metric collection', () => {
    it('emits CPU metrics', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.cpu.user', expect.any(Number), { unit: 'second' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.cpu.system', expect.any(Number), { unit: 'second' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.cpu.utilization', expect.any(Number));
    });

    it('emits memory metrics', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.mem.rss', 50_000_000, { unit: 'byte' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.mem.heap_total', 30_000_000, { unit: 'byte' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.mem.heap_used', 20_000_000, { unit: 'byte' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.mem.external', 1_000_000, { unit: 'byte' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.mem.array_buffers', 500_000, { unit: 'byte' });
    });

    it('emits event loop delay metrics and resets histogram after collection', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      // min: (2_000_000 - 10_000_000) clamped to 0 → 0s
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.event_loop.delay.min', 0, { unit: 'second' });
      // max: (20_000_000 - 10_000_000) / 1e9 → 0.01s
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.event_loop.delay.max', 0.01, { unit: 'second' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.event_loop.delay.mean', 0, { unit: 'second' });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.event_loop.delay.p50', expect.any(Number), {
        unit: 'second',
      });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.event_loop.delay.p90', expect.any(Number), {
        unit: 'second',
      });
      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.event_loop.delay.p99', expect.any(Number), {
        unit: 'second',
      });
      expect(mockHistogram.reset).toHaveBeenCalledOnce();
    });

    it('emits event loop utilization metric', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.event_loop.utilization', 0.3);
    });

    it('emits uptime counter', () => {
      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(countSpy).toHaveBeenCalledWith('node.runtime.process.uptime', expect.any(Number), { unit: 'second' });
    });

    it('does not emit event loop delay metrics if monitorEventLoopDelay threw', () => {
      mockMonitorEventLoopDelay.mockImplementationOnce(() => {
        throw new Error('NotImplementedError');
      });

      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith(
        'node.runtime.event_loop.delay.min',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('opt-out', () => {
    it('skips CPU metrics when collect.cpu is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { cpu: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith('node.runtime.cpu.user', expect.anything(), expect.anything());
      expect(gaugeSpy).not.toHaveBeenCalledWith('node.runtime.cpu.system', expect.anything(), expect.anything());
      expect(gaugeSpy).not.toHaveBeenCalledWith('node.runtime.cpu.utilization', expect.anything(), expect.anything());
    });

    it('skips memory metrics when collect.memory is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { memory: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith('node.runtime.mem.rss', expect.anything(), expect.anything());
    });

    it('skips event loop delay when collect.eventLoopDelay is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { eventLoopDelay: false },
      });
      integration.setup();

      expect(mockMonitorEventLoopDelay).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1_000);
      expect(gaugeSpy).not.toHaveBeenCalledWith(
        'node.runtime.event_loop.delay.min',
        expect.anything(),
        expect.anything(),
      );
    });

    it('skips event loop utilization when collect.eventLoopUtilization is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { eventLoopUtilization: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith(
        'node.runtime.event_loop.utilization',
        expect.anything(),
        expect.anything(),
      );
    });

    it('skips uptime when collect.uptime is false', () => {
      const integration = nodeRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { uptime: false },
      });
      integration.setup();
      vi.advanceTimersByTime(1_000);

      expect(countSpy).not.toHaveBeenCalledWith('node.runtime.process.uptime', expect.anything(), expect.anything());
    });
  });

  describe('serverless flush', () => {
    it('collects metrics and calls flushIfServerless on beforeExit', async () => {
      const { flushIfServerless } = await import('@sentry/core');
      const flushSpy = vi.mocked(flushIfServerless);

      const integration = nodeRuntimeMetricsIntegration({ collectionIntervalMs: 60_000 });
      integration.setup();

      // Interval has not fired yet — beforeExit should still trigger a collection + flush.
      process.emit('beforeExit', 0);

      expect(gaugeSpy).toHaveBeenCalledWith('node.runtime.mem.rss', expect.any(Number), { unit: 'byte' });
      expect(flushSpy).toHaveBeenCalled();
    });
  });
});
