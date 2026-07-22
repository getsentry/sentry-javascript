import { trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
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

const OTEL_API_GLOBAL_KEY = Symbol.for('opentelemetry.js.api.1');

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

    it('installs spanStreaming integration when traceLifecycle is "stream"', () => {
      init({ dsn: PUBLIC_DSN, traceLifecycle: 'stream' });
      const client = getClient();

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          integrations: expect.arrayContaining([expect.objectContaining({ name: 'SpanStreaming' })]),
        }),
      );
    });

    it("doesn't install spanStreaming integration when traceLifecycle is not 'stream'", () => {
      init({ dsn: PUBLIC_DSN });

      const client = getClient();
      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          integrations: expect.not.arrayContaining([expect.objectContaining({ name: 'SpanStreaming' })]),
        }),
      );
    });

    it('installs spanStreaming integration even with custom defaultIntegrations', () => {
      init({ dsn: PUBLIC_DSN, traceLifecycle: 'stream', defaultIntegrations: [] });
      const client = getClient();

      expect(client?.getOptions()).toEqual(
        expect.objectContaining({
          integrations: expect.arrayContaining([expect.objectContaining({ name: 'SpanStreaming' })]),
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

    it('uses the minimal Sentry trace provider by default', () => {
      init({ dsn: PUBLIC_DSN });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).toBeInstanceOf(SentryOpentelemetry.SentryTracerProvider);
    });

    it('uses the OpenTelemetry SDK tracer provider when opted in via `openTelemetryBasicTracerProvider`', () => {
      init({ dsn: PUBLIC_DSN, openTelemetryBasicTracerProvider: true });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).toBeInstanceOf(BasicTracerProvider);
    });

    it('uses the OpenTelemetry SDK tracer provider when custom span processors are provided', () => {
      init({
        dsn: PUBLIC_DSN,
        openTelemetrySpanProcessors: [
          {
            forceFlush: () => Promise.resolve(),
            onStart: () => undefined,
            onEnd: () => undefined,
            shutdown: () => Promise.resolve(),
          },
        ],
      });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).toBeInstanceOf(BasicTracerProvider);
    });

    it('recreates the OTel API registry when it pre-exists with a different @opentelemetry/api version', () => {
      // Simulate a host runtime (e.g. Neon Functions) pre-creating the registry with its own api version
      global[OTEL_API_GLOBAL_KEY] = { version: '0.0.1' };

      init({ dsn: PUBLIC_DSN });

      const client = getClient<NodeClient>();
      const registry = global[OTEL_API_GLOBAL_KEY];

      expect(client?.traceProvider).toBeInstanceOf(SentryOpentelemetry.SentryTracerProvider);
      expect(registry?.version).not.toBe('0.0.1');
      expect(registry?.trace).toBeDefined();
    });

    it('recreates a version-mismatched OTel API registry also for the OpenTelemetry SDK tracer provider', () => {
      global[OTEL_API_GLOBAL_KEY] = { version: '0.0.1' };

      init({ dsn: PUBLIC_DSN, openTelemetryBasicTracerProvider: true });

      const client = getClient<NodeClient>();
      const registry = global[OTEL_API_GLOBAL_KEY];

      expect(client?.traceProvider).toBeInstanceOf(BasicTracerProvider);
      expect(registry?.version).not.toBe('0.0.1');
      expect(registry?.trace).toBeDefined();
    });

    it('carries non-Sentry slots of a version-mismatched OTel API registry over into the recreated one', () => {
      // Must be a complete DiagLogger: once carried over, the SDK's api copy resolves it and
      // calls it for its own diag output.
      const diagLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
      const meterProvider = { getMeter: vi.fn() };
      const propagator = { inject: vi.fn() };
      global[OTEL_API_GLOBAL_KEY] = {
        version: '0.0.1',
        diag: diagLogger,
        metrics: meterProvider,
        propagation: propagator,
      };

      init({ dsn: PUBLIC_DSN });

      const registry = global[OTEL_API_GLOBAL_KEY];

      expect(registry?.trace).toBeDefined();
      expect(registry?.diag).toBe(diagLogger);
      expect(registry?.metrics).toBe(meterProvider);
      // propagation is claimed by Sentry's own propagator, not carried over
      expect(registry?.propagation).not.toBe(propagator);
    });

    it('does not recreate the OTel API registry when another tracer provider is already registered', () => {
      const existingProvider = { getTracer: vi.fn() };
      const existingRegistry = { version: '0.0.1', trace: existingProvider };
      global[OTEL_API_GLOBAL_KEY] = existingRegistry;

      init({ dsn: PUBLIC_DSN });

      const client = getClient<NodeClient>();

      expect(client?.traceProvider).not.toBeDefined();
      expect(global[OTEL_API_GLOBAL_KEY]).toBe(existingRegistry);
      expect(existingRegistry.trace).toBe(existingProvider);

      global[OTEL_API_GLOBAL_KEY] = undefined;
    });

    it('does not mark SentryTracerProvider as set up when global registration fails', () => {
      // Simulate another OpenTelemetry tracer provider already being registered.
      const setGlobalSpy = vi.spyOn(trace, 'setGlobalTracerProvider').mockReturnValue(false);
      const setIsSetupSpy = vi.spyOn(SentryOpentelemetry, 'setIsSetup');
      const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});

      init({ dsn: PUBLIC_DSN });

      expect(getClient<NodeClient>()?.traceProvider).not.toBeDefined();
      expect(setIsSetupSpy).not.toHaveBeenCalledWith('SentryTracerProvider');
      expect(warnSpy).toHaveBeenCalledWith(
        'Could not register SentryTracerProvider because another OpenTelemetry tracer provider is already registered.',
      );

      setGlobalSpy.mockRestore();
      setIsSetupSpy.mockRestore();
    });
  });

  it('returns initialized client', () => {
    const client = init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });

    expect(client).toBeInstanceOf(NodeClient);
  });

  it('registers a SIGTERM handler on Vercel', () => {
    const originalVercelEnv = process.env.VERCEL;
    process.env.VERCEL = '1';

    const baselineListeners = process.listeners('SIGTERM');

    init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });

    const postInitListeners = process.listeners('SIGTERM');
    const addedListeners = postInitListeners.filter(l => !baselineListeners.includes(l));

    expect(addedListeners).toHaveLength(1);

    // Cleanup: remove the handler we added in this test.
    process.off('SIGTERM', addedListeners[0] as any);
    process.env.VERCEL = originalVercelEnv;
  });

  it('flushes when SIGTERM is received on Vercel', () => {
    const originalVercelEnv = process.env.VERCEL;
    process.env.VERCEL = '1';

    const baselineListeners = process.listeners('SIGTERM');

    const client = init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });
    expect(client).toBeInstanceOf(NodeClient);

    const flushSpy = vi.spyOn(client as NodeClient, 'flush').mockResolvedValue(true);

    const postInitListeners = process.listeners('SIGTERM');
    const addedListeners = postInitListeners.filter(l => !baselineListeners.includes(l));
    expect(addedListeners).toHaveLength(1);

    process.emit('SIGTERM');

    expect(flushSpy).toHaveBeenCalledWith(200);

    // Cleanup: remove the handler we added in this test.
    process.off('SIGTERM', addedListeners[0] as any);
    process.env.VERCEL = originalVercelEnv;
  });

  it('does not register a SIGTERM handler when not running on Vercel', () => {
    const originalVercelEnv = process.env.VERCEL;
    delete process.env.VERCEL;

    const baselineListeners = process.listeners('SIGTERM');

    init({ dsn: PUBLIC_DSN, skipOpenTelemetrySetup: true });

    const postInitListeners = process.listeners('SIGTERM');
    const addedListeners = postInitListeners.filter(l => !baselineListeners.includes(l));

    expect(addedListeners).toHaveLength(0);

    process.env.VERCEL = originalVercelEnv;
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

    describe('spotlight configuration', () => {
      afterEach(() => {
        delete process.env.SENTRY_SPOTLIGHT;
      });

      it('enables spotlight with default URL from `SENTRY_SPOTLIGHT` env variable (truthy value)', () => {
        process.env.SENTRY_SPOTLIGHT = 'true';

        const client = init({ dsn: PUBLIC_DSN });

        expect(client?.getOptions().spotlight).toBe(true);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
      });

      it('disables spotlight from `SENTRY_SPOTLIGHT` env variable (falsy value)', () => {
        process.env.SENTRY_SPOTLIGHT = 'false';

        const client = init({ dsn: PUBLIC_DSN });

        expect(client?.getOptions().spotlight).toBe(false);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(false);
      });

      it('enables spotlight with custom URL from `SENTRY_SPOTLIGHT` env variable', () => {
        process.env.SENTRY_SPOTLIGHT = 'http://localhost:3000/stream';

        const client = init({ dsn: PUBLIC_DSN });

        expect(client?.getOptions().spotlight).toBe('http://localhost:3000/stream');
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
      });

      it('enables spotlight with default URL from config `true`', () => {
        const client = init({ dsn: PUBLIC_DSN, spotlight: true });

        expect(client?.getOptions().spotlight).toBe(true);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
      });

      it('disables spotlight from config `false`', () => {
        const client = init({ dsn: PUBLIC_DSN, spotlight: false });

        expect(client?.getOptions().spotlight).toBe(false);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(false);
      });

      it('enables spotlight with custom URL from config', () => {
        const client = init({ dsn: PUBLIC_DSN, spotlight: 'http://custom:8888/stream' });

        expect(client?.getOptions().spotlight).toBe('http://custom:8888/stream');
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
      });

      it('config `false` overrides `SENTRY_SPOTLIGHT` env variable URL', () => {
        process.env.SENTRY_SPOTLIGHT = 'http://localhost:3000/stream';

        const client = init({ dsn: PUBLIC_DSN, spotlight: false });

        expect(client?.getOptions().spotlight).toBe(false);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(false);
      });

      it('config `false` overrides `SENTRY_SPOTLIGHT` env variable truthy value', () => {
        process.env.SENTRY_SPOTLIGHT = 'true';

        const client = init({ dsn: PUBLIC_DSN, spotlight: false });

        expect(client?.getOptions().spotlight).toBe(false);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(false);
      });

      it('config `false` with `SENTRY_SPOTLIGHT` env variable falsy value keeps spotlight disabled', () => {
        process.env.SENTRY_SPOTLIGHT = 'false';

        const client = init({ dsn: PUBLIC_DSN, spotlight: false });

        expect(client?.getOptions().spotlight).toBe(false);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(false);
      });

      it('config URL overrides `SENTRY_SPOTLIGHT` env variable URL', () => {
        process.env.SENTRY_SPOTLIGHT = 'http://env:3000/stream';

        const client = init({ dsn: PUBLIC_DSN, spotlight: 'http://config:8888/stream' });

        expect(client?.getOptions().spotlight).toBe('http://config:8888/stream');
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
      });

      it('config `true` with env var URL uses env var URL', () => {
        process.env.SENTRY_SPOTLIGHT = 'http://localhost:3000/stream';

        const client = init({ dsn: PUBLIC_DSN, spotlight: true });

        expect(client?.getOptions().spotlight).toBe('http://localhost:3000/stream');
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
      });

      it('config `true` with env var truthy value uses default URL', () => {
        process.env.SENTRY_SPOTLIGHT = 'true';

        const client = init({ dsn: PUBLIC_DSN, spotlight: true });

        expect(client?.getOptions().spotlight).toBe(true);
        expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
      });
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
