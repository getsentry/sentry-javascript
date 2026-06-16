import * as sentryBrowser from '@sentry/browser';
import type { Client } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isClientInstrumentationApiUsed } from '../../src/client/createClientInstrumentation';
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
    it('builds clientInstrumentation by default (no option required)', () => {
      const integration = reactRouterTracingIntegration();

      expect(integration.clientInstrumentation).toBeDefined();
      expect(typeof integration.clientInstrumentation.router).toBe('function');
      expect(typeof integration.clientInstrumentation.route).toBe('function');
    });

    it('returns the same clientInstrumentation instance on multiple accesses', () => {
      const integration = reactRouterTracingIntegration();

      expect(integration.clientInstrumentation).toBe(integration.clientInstrumentation);
    });

    it('passes instrumentationOptions to createSentryClientInstrumentation', () => {
      const integration = reactRouterTracingIntegration({ instrumentationOptions: { captureErrors: false } });

      expect(integration.clientInstrumentation).toBeDefined();
      expect(typeof integration.clientInstrumentation.router).toBe('function');
    });

    it('does not mark the instrumentation API used until React Router invokes router()', () => {
      // Building the instrumentation must NOT set the flag - otherwise the legacy
      // instrumentHydratedRouter() fallback would be disabled on React Router versions (< 7.15)
      // that never invoke the hooks, leaving those apps with no navigation spans.
      const integration = reactRouterTracingIntegration();

      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();
      expect(isClientInstrumentationApiUsed()).toBe(false);

      // React Router invoking router() (>= 7.15, Framework Mode) is what flips the flag.
      integration.clientInstrumentation.router?.({ instrument: vi.fn() });

      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBe(true);
      expect(isClientInstrumentationApiUsed()).toBe(true);
    });
  });
});
