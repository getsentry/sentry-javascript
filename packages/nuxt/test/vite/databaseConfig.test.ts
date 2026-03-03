import type { NitroConfig } from 'nitropack/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';
import { addDatabaseInstrumentation } from '../../src/vite/databaseConfig';

vi.mock('@sentry/core', () => ({
  consoleSandbox: (callback: () => void) => callback(),
}));

vi.mock('@nuxt/kit', () => ({
  addServerPlugin: vi.fn(),
  createResolver: vi.fn(() => ({
    resolve: vi.fn((path: string) => path),
  })),
}));

vi.mock('../../src/vendor/server-template', () => ({
  addServerTemplate: vi.fn(),
}));

describe('addDatabaseInstrumentation', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    consoleLogSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('debug logging when no database configuration', () => {
    it('should log debug message when debug is enabled and no database config', () => {
      const nitroConfig: NitroConfig = {};
      const moduleOptions: SentryNuxtModuleOptions = { debug: true };

      addDatabaseInstrumentation(nitroConfig, moduleOptions);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Sentry] [Nitro Database Plugin]: No database configuration found. Skipping database instrumentation.',
      );
    });

    it('should not log debug message when debug is disabled and no database config', () => {
      const nitroConfig: NitroConfig = {};
      const moduleOptions: SentryNuxtModuleOptions = { debug: false };

      addDatabaseInstrumentation(nitroConfig, moduleOptions);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug message when moduleOptions is undefined', () => {
      const nitroConfig: NitroConfig = {};

      addDatabaseInstrumentation(nitroConfig, undefined);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug message when debug is not set in moduleOptions', () => {
      const nitroConfig: NitroConfig = {};
      const moduleOptions: SentryNuxtModuleOptions = {};

      addDatabaseInstrumentation(nitroConfig, moduleOptions);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log debug message when experimental.database is explicitly false and debug is true', () => {
      const nitroConfig: NitroConfig = { experimental: { database: false } };
      const moduleOptions: SentryNuxtModuleOptions = { debug: true };

      addDatabaseInstrumentation(nitroConfig, moduleOptions);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Sentry] [Nitro Database Plugin]: No database configuration found. Skipping database instrumentation.',
      );
    });
  });
});
