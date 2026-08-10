import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockDebugBuild = true;

vi.mock('../src/debug-build', () => ({
  get DEBUG_BUILD() {
    return mockDebugBuild;
  },
}));

// Must import after mocking
const { metricsShim } = await import('../src/metrics');

describe('metrics shims', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    consoleWarnSpy.mockClear();
  });

  afterEach(() => {
    mockDebugBuild = true;
  });

  describe('when DEBUG_BUILD is true', () => {
    beforeEach(() => {
      mockDebugBuild = true;
    });

    it.each(['count', 'gauge', 'distribution'] as const)('metricsShim.%s should warn', method => {
      metricsShim[method]('test', 1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'You are using Sentry.metrics.* even though this bundle does not include metrics.',
      );
    });
  });

  describe('when DEBUG_BUILD is false', () => {
    beforeEach(() => {
      mockDebugBuild = false;
    });

    it('metricsShim methods should NOT warn', () => {
      metricsShim.count('test', 1);
      metricsShim.gauge('test', 1);
      metricsShim.distribution('test', 1);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
