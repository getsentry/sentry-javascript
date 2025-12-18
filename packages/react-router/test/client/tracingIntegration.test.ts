import * as sentryBrowser from '@sentry/browser';
import type { Client } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as hydratedRouterModule from '../../src/client/hydratedRouter';
import { reactRouterTracingIntegration } from '../../src/client/tracingIntegration';

// Global flag used by client instrumentation API
const SENTRY_CLIENT_INSTRUMENTATION_FLAG = '__sentryReactRouterClientInstrumentationUsed';

type GlobalObjWithFlag = typeof GLOBAL_OBJ & {
  [SENTRY_CLIENT_INSTRUMENTATION_FLAG]?: boolean;
};

describe('reactRouterTracingIntegration', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Clean up global flag between tests
    (GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG] = undefined;
  });

  it('returns an integration with the correct name and properties', () => {
    const integration = reactRouterTracingIntegration();
    expect(integration.name).toBe('ReactRouterTracingIntegration');
    expect(typeof integration.afterAllSetup).toBe('function');
  });

  it('calls instrumentHydratedRouter and browserTracingIntegrationInstance.afterAllSetup in afterAllSetup', () => {
    const browserTracingSpy = vi.spyOn(sentryBrowser, 'browserTracingIntegration').mockImplementation(() => ({
      setup: vi.fn(),
      afterAllSetup: vi.fn(),
      name: 'BrowserTracing',
    }));
    const instrumentSpy = vi.spyOn(hydratedRouterModule, 'instrumentHydratedRouter').mockImplementation(() => null);
    const integration = reactRouterTracingIntegration();
    integration.afterAllSetup?.({} as Client);

    expect(browserTracingSpy).toHaveBeenCalled();
    expect(instrumentSpy).toHaveBeenCalled();
  });

  describe('clientInstrumentation', () => {
    it('provides clientInstrumentation property', () => {
      const integration = reactRouterTracingIntegration();

      expect(integration.clientInstrumentation).toBeDefined();
    });

    it('lazily creates clientInstrumentation only when accessed', () => {
      const integration = reactRouterTracingIntegration();

      // Flag should not be set yet (lazy initialization)
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      // Access the instrumentation
      const instrumentation = integration.clientInstrumentation;

      // Now the flag should be set
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBe(true);
      expect(instrumentation).toBeDefined();
      expect(typeof instrumentation.router).toBe('function');
      expect(typeof instrumentation.route).toBe('function');
    });

    it('returns the same clientInstrumentation instance on multiple accesses', () => {
      const integration = reactRouterTracingIntegration();

      const first = integration.clientInstrumentation;
      const second = integration.clientInstrumentation;

      expect(first).toBe(second);
    });

    it('passes options to createSentryClientInstrumentation', () => {
      const integration = reactRouterTracingIntegration({
        instrumentationOptions: {
          captureErrors: false,
        },
      });

      const instrumentation = integration.clientInstrumentation;

      // The instrumentation is created - we can verify by checking it has the expected shape
      expect(instrumentation).toBeDefined();
      expect(typeof instrumentation.router).toBe('function');
      expect(typeof instrumentation.route).toBe('function');
    });

    it('eagerly creates instrumentation when useInstrumentationAPI is true', () => {
      // Flag should not be set before creating integration
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      // Create integration with useInstrumentationAPI: true
      reactRouterTracingIntegration({ useInstrumentationAPI: true });

      // Flag should be set immediately (eager initialization), not waiting for getter access
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBe(true);
    });

    it('eagerly creates instrumentation when instrumentationOptions is provided', () => {
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      reactRouterTracingIntegration({ instrumentationOptions: {} });

      // Flag should be set immediately due to options presence
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBe(true);
    });

    it('calls instrumentHydratedRouter when useInstrumentationAPI is true', () => {
      vi.spyOn(sentryBrowser, 'browserTracingIntegration').mockImplementation(() => ({
        setup: vi.fn(),
        afterAllSetup: vi.fn(),
        name: 'BrowserTracing',
      }));
      const instrumentSpy = vi.spyOn(hydratedRouterModule, 'instrumentHydratedRouter').mockImplementation(() => null);

      // Create with useInstrumentationAPI - flag is set eagerly
      const integration = reactRouterTracingIntegration({ useInstrumentationAPI: true });

      // afterAllSetup runs
      integration.afterAllSetup?.({} as Client);

      // instrumentHydratedRouter is called for both pageload and navigation handling
      // (In Framework Mode, HydratedRouter doesn't invoke client hooks, so legacy instrumentation remains active)
      expect(instrumentSpy).toHaveBeenCalled();
    });
  });
});
