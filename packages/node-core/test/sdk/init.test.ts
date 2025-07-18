import type { Integration } from '@sentry/core';
import { debug, SDK_VERSION } from '@sentry/core';
import * as SentryOpentelemetry from '@sentry/opentelemetry';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../../src/';
import { init, validateOpenTelemetrySetup } from '../../src/sdk';
import { NodeClient } from '../../src/sdk/client';
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
  beforeEach(() => {
    global.__SENTRY__ = {};
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
            name: 'sentry.javascript.node-core',
            version: SDK_VERSION,
            packages: [{ name: 'npm:@sentry/node-core', version: SDK_VERSION }],
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
      expect(newIntegration.setupOnce as Mock).toHaveBeenCalledTimes(1);
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
