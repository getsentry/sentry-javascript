import { afterEach, beforeEach, describe, expect, it, jest, mock, spyOn } from 'bun:test';
import { metrics } from '@sentry/core';

const mockElu = { idle: 700, active: 300, utilization: 0.3 };
const mockEluDelta = { idle: 700, active: 300, utilization: 0.3 };
const mockEventLoopUtilization = jest.fn((curr?: object, _prev?: object) => {
  if (curr) return mockEluDelta;
  return mockElu;
});

mock.module('perf_hooks', () => ({
  performance: { eventLoopUtilization: mockEventLoopUtilization },
}));

const { bunRuntimeMetricsIntegration } = await import('../../src/integrations/bunRuntimeMetrics');

describe('bunRuntimeMetricsIntegration', () => {
  let gaugeSpy: ReturnType<typeof spyOn>;
  let countSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    gaugeSpy = spyOn(metrics, 'gauge').mockImplementation(() => undefined);
    countSpy = spyOn(metrics, 'count').mockImplementation(() => undefined);

    spyOn(process, 'cpuUsage').mockReturnValue({ user: 500_000, system: 200_000 });
    spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 50_000_000,
      heapTotal: 30_000_000,
      heapUsed: 20_000_000,
      external: 1_000_000,
      arrayBuffers: 500_000,
    });

    mockEventLoopUtilization.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('has the correct name', () => {
    const integration = bunRuntimeMetricsIntegration();
    expect(integration.name).toBe('BunRuntimeMetrics');
  });

  describe('setup', () => {
    it('starts a collection interval', () => {
      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();

      expect(gaugeSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1_000);
      expect(gaugeSpy).toHaveBeenCalled();
    });

    it('does not throw if performance.eventLoopUtilization is unavailable', () => {
      mockEventLoopUtilization.mockImplementationOnce(() => {
        throw new Error('Not implemented');
      });

      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      expect(() => integration.setup()).not.toThrow();
    });
  });

  const ORIGIN = { attributes: { 'sentry.origin': 'auto.bun.runtime_metrics' } };
  const BYTE = { unit: 'byte', attributes: { 'sentry.origin': 'auto.bun.runtime_metrics' } };
  const SECOND = { unit: 'second', attributes: { 'sentry.origin': 'auto.bun.runtime_metrics' } };

  describe('metric collection — defaults', () => {
    it('emits cpu utilization (default on)', () => {
      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.cpu.utilization', expect.any(Number), ORIGIN);
    });

    it('does not emit cpu.user / cpu.system by default (opt-in)', () => {
      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith('bun.runtime.cpu.user', expect.anything(), expect.anything());
      expect(gaugeSpy).not.toHaveBeenCalledWith('bun.runtime.cpu.system', expect.anything(), expect.anything());
    });

    it('emits cpu.user / cpu.system when cpuTime is opted in', () => {
      const integration = bunRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { cpuTime: true },
      });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.cpu.user', expect.any(Number), SECOND);
      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.cpu.system', expect.any(Number), SECOND);
    });

    it('emits mem.rss, mem.heap_used, mem.heap_total (default on)', () => {
      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.mem.rss', 50_000_000, BYTE);
      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.mem.heap_used', 20_000_000, BYTE);
      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.mem.heap_total', 30_000_000, BYTE);
    });

    it('does not emit mem.external / mem.array_buffers by default (opt-in)', () => {
      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith('bun.runtime.mem.external', expect.anything(), expect.anything());
      expect(gaugeSpy).not.toHaveBeenCalledWith('bun.runtime.mem.array_buffers', expect.anything(), expect.anything());
    });

    it('emits mem.external / mem.array_buffers when opted in', () => {
      const integration = bunRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { memExternal: true },
      });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.mem.external', 1_000_000, BYTE);
      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.mem.array_buffers', 500_000, BYTE);
    });

    it('emits event loop utilization metric', () => {
      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).toHaveBeenCalledWith('bun.runtime.event_loop.utilization', 0.3, ORIGIN);
    });

    it('does not emit event loop utilization if performance.eventLoopUtilization threw during setup', () => {
      mockEventLoopUtilization.mockImplementationOnce(() => {
        throw new Error('Not implemented');
      });

      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith(
        'bun.runtime.event_loop.utilization',
        expect.anything(),
        expect.anything(),
      );
    });

    it('emits uptime counter', () => {
      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(countSpy).toHaveBeenCalledWith('bun.runtime.process.uptime', expect.any(Number), SECOND);
    });
  });

  describe('opt-out', () => {
    it('skips cpu.utilization when cpuUtilization is false', () => {
      const integration = bunRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { cpuUtilization: false },
      });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith('bun.runtime.cpu.utilization', expect.anything(), expect.anything());
    });

    it('skips mem.rss when memRss is false', () => {
      const integration = bunRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { memRss: false },
      });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith('bun.runtime.mem.rss', expect.anything(), expect.anything());
    });

    it('skips event loop utilization when eventLoopUtilization is false', () => {
      const integration = bunRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { eventLoopUtilization: false },
      });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(gaugeSpy).not.toHaveBeenCalledWith(
        'bun.runtime.event_loop.utilization',
        expect.anything(),
        expect.anything(),
      );
    });

    it('skips uptime when uptime is false', () => {
      const integration = bunRuntimeMetricsIntegration({
        collectionIntervalMs: 1_000,
        collect: { uptime: false },
      });
      integration.setup();
      jest.advanceTimersByTime(1_000);

      expect(countSpy).not.toHaveBeenCalledWith('bun.runtime.process.uptime', expect.anything(), expect.anything());
    });
  });

  describe('collectionIntervalMs minimum', () => {
    it('enforces minimum of 1000ms and warns', () => {
      const warnSpy = spyOn(globalThis.console, 'warn').mockImplementation(() => {});

      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: 100 });
      integration.setup();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('collectionIntervalMs'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1000'));

      // Should fire at minimum 1000ms, not at 100ms
      jest.advanceTimersByTime(100);
      expect(gaugeSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(900);
      expect(gaugeSpy).toHaveBeenCalled();
    });

    it('falls back to default when NaN', () => {
      const warnSpy = spyOn(globalThis.console, 'warn').mockImplementation(() => {});

      const integration = bunRuntimeMetricsIntegration({ collectionIntervalMs: NaN });
      integration.setup();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('collectionIntervalMs'));

      // Should fire at the default 30000ms, not at 1000ms
      jest.advanceTimersByTime(1000);
      expect(gaugeSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(29_000);
      expect(gaugeSpy).toHaveBeenCalled();
    });
  });
});
