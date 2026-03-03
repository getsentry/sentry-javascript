import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockDebugBuild = true;

vi.mock('../src/debug-build', () => ({
  get DEBUG_BUILD() {
    return mockDebugBuild;
  },
}));

// Must import after mocking
const { loggerShim, consoleLoggingIntegrationShim } = await import('../src/logs');

describe('logs shims', () => {
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

    it('loggerShim methods should warn', () => {
      loggerShim.trace('test');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'You are using Sentry.logger.* even though this bundle does not include logs.',
      );
    });

    it('loggerShim.fmt should warn', () => {
      loggerShim.fmt`test`;
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'You are using Sentry.logger.fmt even though this bundle does not include logs.',
      );
    });

    it('consoleLoggingIntegrationShim should warn', () => {
      consoleLoggingIntegrationShim();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'You are using consoleLoggingIntegration() even though this bundle does not include logs.',
      );
    });
  });

  describe('when DEBUG_BUILD is false', () => {
    beforeEach(() => {
      mockDebugBuild = false;
    });

    it('loggerShim methods should NOT warn', () => {
      loggerShim.trace('test');
      loggerShim.debug('test');
      loggerShim.info('test');
      loggerShim.warn('test');
      loggerShim.error('test');
      loggerShim.fatal('test');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('loggerShim.fmt should NOT warn', () => {
      loggerShim.fmt`test`;
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('consoleLoggingIntegrationShim should NOT warn', () => {
      consoleLoggingIntegrationShim();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
