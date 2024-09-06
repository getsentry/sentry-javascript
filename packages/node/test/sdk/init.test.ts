import type { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import * as SentryOpentelemetry from '@sentry/opentelemetry';
import { getClient, getIsolationScope } from '../../src/';
import * as auto from '../../src/integrations/tracing';
import { init, validateOpenTelemetrySetup } from '../../src/sdk';
import { NodeClient } from '../../src/sdk/client';
import { cleanupOtel } from '../helpers/mockSdkInit';

import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

    mockAutoPerformanceIntegrations = vi.spyOn(auto, 'getAutoPerformanceIntegrations').mockImplementation(() => []);
  });

  afterEach(() => {
    cleanupOtel();

    vi.clearAllMocks();
  });

  describe('integrations', () => {
    test("doesn't install default integrations if told not to", () => {
      init({ dsn: PUBLIC_DSN, defaultIntegrations: false });

      const client = getClient();

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          integrations: [],
        }),
      );

      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    test('installs merged default integrations, with overrides provided through options', () => {
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

    test('installs integrations returned from a callback function', () => {
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
      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    test('installs performance default instrumentations if tracing is enabled', () => {
      const autoPerformanceIntegration = new MockIntegration('Some mock integration 4.4');

      mockAutoPerformanceIntegrations.mockReset().mockImplementation(() => [autoPerformanceIntegration]);

      const mockIntegrations = [
        new MockIntegration('Some mock integration 4.1'),
        new MockIntegration('Some mock integration 4.3'),
      ];

      init({
        dsn: PUBLIC_DSN,
        integrations: mockIntegrations,
        enableTracing: true,
      });

      expect(mockIntegrations[0]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(mockIntegrations[1]?.setupOnce as Mock).toHaveBeenCalledTimes(1);
      expect(autoPerformanceIntegration.setupOnce as Mock).toHaveBeenCalledTimes(1);
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
    test('sets up OpenTelemetry by default', () => {
      init({ dsn: PUBLIC_DSN });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).toBeDefined();
    });

    test('allows to opt-out of OpenTelemetry setup', () => {
      init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).not.toBeDefined();
    });
  });

  test('returns intiated client', () => {
    const client = init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });

    expect(client).toBeInstanceOf(NodeClient);
  });

  describe('autoSessionTracking', () => {
    test('does not track session by default if no release is set', () => {
      // On CI, we always infer the release, so this does not work
      if (process.env.CI) {
        return;
      }
      init({ dsn: PUBLIC_DSN });

      const session = getIsolationScope().getSession();
      expect(session).toBeUndefined();
    });

    test('tracks session by default if release is set', () => {
      init({ dsn: PUBLIC_DSN, release: '1.2.3' });

      const session = getIsolationScope().getSession();
      expect(session).toBeDefined();
    });

    test('does not track session if no release is set even if autoSessionTracking=true', () => {
      // On CI, we always infer the release, so this does not work
      if (process.env.CI) {
        return;
      }

      init({ dsn: PUBLIC_DSN, autoSessionTracking: true });

      const session = getIsolationScope().getSession();
      expect(session).toBeUndefined();
    });

    test('does not track session if autoSessionTracking=false', () => {
      init({ dsn: PUBLIC_DSN, autoSessionTracking: false, release: '1.2.3' });

      const session = getIsolationScope().getSession();
      expect(session).toBeUndefined();
    });

    test('tracks session by default if autoSessionTracking=true & release is set', () => {
      init({ dsn: PUBLIC_DSN, release: '1.2.3', autoSessionTracking: true });

      const session = getIsolationScope().getSession();
      expect(session).toBeDefined();
    });
  });
});

describe('validateOpenTelemetrySetup', () => {
  afterEach(() => {
    global.__SENTRY__ = {};
    cleanupOtel();
    vi.clearAllMocks();
  });

  test('works with correct setup', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    vi.spyOn(SentryOpentelemetry, 'openTelemetrySetupCheck').mockImplementation(() => {
      return ['SentryContextManager', 'SentryPropagator', 'SentrySampler'];
    });

    validateOpenTelemetrySetup();

    expect(errorSpy).toHaveBeenCalledTimes(0);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  test('works with missing setup, without tracing', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

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

  test('works with missing setup, with tracing', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

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
});
