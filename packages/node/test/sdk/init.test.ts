import type { Integration } from '@sentry/core';
import { debug, SDK_VERSION } from '@sentry/core';
import * as SentryOpentelemetry from '@sentry/opentelemetry';
import { afterEach, beforeEach, describe, expect, it, type Mock, type MockInstance, vi } from 'vitest';
import { getClient, NodeClient, validateOpenTelemetrySetup } from '../../src/';
import * as auto from '../../src/integrations/tracing';
import { init } from '../../src/sdk';
import { cleanupOtel } from '../helpers/mockSdkInit';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

class MockIntegration implements Integration {
  public name: string;
  public setupOnce: Mock = vi.fn();
  public constructor(name: string) {
    this.name = name;
  }
}

describe('init()', () => {
  let mockAutoPerformanceIntegrations: MockInstance = vi.fn(() => []);

  beforeEach(() => {
    global.__SENTRY__ = {};

    // prevent the debug from being enabled, resulting in console.log calls
    vi.spyOn(debug, 'enable').mockImplementation(() => {});

    mockAutoPerformanceIntegrations = vi.spyOn(auto, 'getAutoPerformanceIntegrations').mockImplementation(() => []);
  });

  afterEach(() => {
    cleanupOtel();

    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('has the correct metadata', () => {
      init({ dsn: PUBLIC_DSN });

      const client = getClient<NodeClient>();

      expect(client?.getSdkMetadata()).toEqual(
        expect.objectContaining({
          sdk: {
            name: 'sentry.javascript.node',
            version: SDK_VERSION,
            packages: [{ name: 'npm:@sentry/node', version: SDK_VERSION }],
          },
        }),
      );
    });
  });

  describe('integrations', () => {
    it("doesn't install default integrations if told not to", () => {
      init({ dsn: PUBLIC_DSN, defaultIntegrations: false });

      const client = getClient();

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          integrations: [],
        }),
      );

      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    it('installs merged default integrations, with overrides provided through options', () => {
      const mockDefaultIntegrations = [
        new MockIntegration('Some mock integration 2.1'),
        new MockIntegration('Some mock integration 2.2'),
      ];

      const mockIntegrations = [
        new MockIntegration('Some mock integration 2.1'),
        new MockIntegration('Some mock integration 2.3'),
      ];

      init({ dsn: PUBLIC_DSN, integrations: mockIntegrations, defaultIntegrations: mockDefaultIntegrations });

      expect(mockDefaultIntegrations[0]?.setupOnce as Mock).toHaveBeenCalledTimes(0);
      expect(mockDefaultIntegrations[1]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(mockIntegrations[0]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(mockIntegrations[1]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    it('installs integrations returned from a callback function', () => {
      const mockDefaultIntegrations = [
        new MockIntegration('Some mock integration 3.1'),
        new MockIntegration('Some mock integration 3.2'),
      ];

      const newIntegration = new MockIntegration('Some mock integration 3.3');

      init({
        dsn: PUBLIC_DSN,
        defaultIntegrations: mockDefaultIntegrations,
        integrations: integrations => {
          const newIntegrations = [...integrations];
          newIntegrations[1] = newIntegration;
          return newIntegrations;
        },
      });

      expect(mockDefaultIntegrations[0]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(mockDefaultIntegrations[1]?.setupOnce as Mock).toHaveBeenCalledTimes(0);
      expect(newIntegration.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    it('installs performance default instrumentations if tracing is enabled', () => {
      const autoPerformanceIntegration = new MockIntegration('Some mock integration 4.4');

      mockAutoPerformanceIntegrations.mockReset().mockImplementation(() => [autoPerformanceIntegration]);

      const mockIntegrations = [
        new MockIntegration('Some mock integration 4.1'),
        new MockIntegration('Some mock integration 4.3'),
      ];

      init({
        dsn: PUBLIC_DSN,
        integrations: mockIntegrations,
        tracesSampleRate: 1,
      });

      expect(mockIntegrations[0]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(mockIntegrations[1]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(autoPerformanceIntegration.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(1);

      const client = getClient();
      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          integrations: expect.arrayContaining([mockIntegrations[0], mockIntegrations[1], autoPerformanceIntegration]),
        }),
      );
    });
  });

  describe('OpenTelemetry', () => {
    it('sets up OpenTelemetry by default', () => {
      init({ dsn: PUBLIC_DSN });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).toBeDefined();
    });

    it('allows to opt-out of OpenTelemetry setup', () => {
      init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).not.toBeDefined();
    });
  });

  it('returns initialized client', () => {
    const client = init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });

    expect(client).toBeInstanceOf(NodeClient);
  });

  describe('environment variable options', () => {
    const originalProcessEnv = { ...process.env };

    afterEach(() => {
      process.env = originalProcessEnv;
      global.__SENTRY__ = {};
      cleanupOtel();
      vi.clearAllMocks();
    });

    it('sets debug from `SENTRY_DEBUG` env variable', () => {
      process.env.SENTRY_DEBUG = '1';

      const client = init({ dsn: PUBLIC_DSN });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          debug: true,
        }),
      );
    });

    it('prefers `debug` option over `SENTRY_DEBUG` env variable', () => {
      process.env.SENTRY_DEBUG = '1';

      const client = init({ dsn: PUBLIC_DSN, debug: false });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          debug: false,
        }),
      );
    });

    it('sets tracesSampleRate from `SENTRY_TRACES_SAMPLE_RATE` env variable', () => {
      process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';

      const client = init({ dsn: PUBLIC_DSN });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          tracesSampleRate: 0.5,
        }),
      );
    });

    it('prefers `tracesSampleRate` option over `SENTRY_TRACES_SAMPLE_RATE` env variable', () => {
      process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';

      const client = init({ dsn: PUBLIC_DSN, tracesSampleRate: 0.1 });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          tracesSampleRate: 0.1,
        }),
      );
    });

    it('sets release from `SENTRY_RELEASE` env variable', () => {
      process.env.SENTRY_RELEASE = '1.0.0';

      const client = init({ dsn: PUBLIC_DSN });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          release: '1.0.0',
        }),
      );
    });

    it('prefers `release` option over `SENTRY_RELEASE` env variable', () => {
      process.env.SENTRY_RELEASE = '1.0.0';

      const client = init({ dsn: PUBLIC_DSN, release: '2.0.0' });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          release: '2.0.0',
        }),
      );
    });

    it('sets environment from `SENTRY_ENVIRONMENT` env variable', () => {
      process.env.SENTRY_ENVIRONMENT = 'production';

      const client = init({ dsn: PUBLIC_DSN });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          environment: 'production',
        }),
      );
    });

    it('prefers `environment` option over `SENTRY_ENVIRONMENT` env variable', () => {
      process.env.SENTRY_ENVIRONMENT = 'production';

      const client = init({ dsn: PUBLIC_DSN, environment: 'staging' });

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          environment: 'staging',
        }),
      );
    });
  });
});

describe('validateOpenTelemetrySetup', () => {
  afterEach(() => {
    global.__SENTRY__ = {};
    cleanupOtel();
    vi.clearAllMocks();
  });

  it('works with correct setup', () => {
    const errorSpy = vi.spyOn(debug, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});

    vi.spyOn(SentryOpentelemetry, 'openTelemetrySetupCheck').mockImplementation(() => {
      return ['SentryContextManager', 'SentryPropagator', 'SentrySampler'];
    });

    validateOpenTelemetrySetup();

    expect(errorSpy).toHaveBeenCalledTimes(0);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it('works with missing setup, without tracing', () => {
    const errorSpy = vi.spyOn(debug, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});

    vi.spyOn(SentryOpentelemetry, 'openTelemetrySetupCheck').mockImplementation(() => {
      return [];
    });

    validateOpenTelemetrySetup();

    // Without tracing, this is expected only twice
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    expect(errorSpy).toBeCalledWith(expect.stringContaining('You have to set up the SentryContextManager.'));
    expect(errorSpy).toBeCalledWith(expect.stringContaining('You have to set up the SentryPropagator.'));
    expect(warnSpy).toBeCalledWith(expect.stringContaining('You have to set up the SentrySampler.'));
  });

  it('works with missing setup, with tracing', () => {
    const errorSpy = vi.spyOn(debug, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});

    vi.spyOn(SentryOpentelemetry, 'openTelemetrySetupCheck').mockImplementation(() => {
      return [];
    });

    init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true, tracesSampleRate: 1 });

    validateOpenTelemetrySetup();

    expect(errorSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    expect(errorSpy).toBeCalledWith(expect.stringContaining('You have to set up the SentryContextManager.'));
    expect(errorSpy).toBeCalledWith(expect.stringContaining('You have to set up the SentryPropagator.'));
    expect(errorSpy).toBeCalledWith(expect.stringContaining('You have to set up the SentrySpanProcessor.'));
    expect(warnSpy).toBeCalledWith(expect.stringContaining('You have to set up the SentrySampler.'));
  });

  // Regression test for https://github.com/getsentry/sentry-javascript/issues/15558
  it('accepts an undefined transport', () => {
    init({ dsn: PUBLIC_DSN, transport: undefined });
  });
});
