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

      // Flag is still NOT set - it only gets set when router() is called by React Router
      // This is important for Framework Mode where router() is never called
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();
      expect(instrumentation).toBeDefined();
      expect(typeof instrumentation.router).toBe('function');
      expect(typeof instrumentation.route).toBe('function');

      // Simulate React Router calling router() - this is what sets the flag
      const mockInstrument = vi.fn();
      instrumentation.router?.({ instrument: mockInstrument });
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBe(true);
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
      const integration = reactRouterTracingIntegration({ useInstrumentationAPI: true });

      // Flag should NOT be set just by creating integration - only when router() is called
      // This is critical for Framework Mode where router() is never called
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      // Verify instrumentation was eagerly created (accessible immediately)
      expect(integration.clientInstrumentation).toBeDefined();

      // Simulate React Router calling router() - this is what sets the flag
      const mockInstrument = vi.fn();
      integration.clientInstrumentation?.router?.({ instrument: mockInstrument });
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBe(true);
    });

    it('eagerly creates instrumentation when instrumentationOptions is provided', () => {
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      const integration = reactRouterTracingIntegration({ instrumentationOptions: {} });

      // Flag should NOT be set just by creating integration - only when router() is called
      // This is critical for Framework Mode where router() is never called
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      // Verify instrumentation was eagerly created (accessible immediately)
      expect(integration.clientInstrumentation).toBeDefined();

      // Simulate React Router calling router() - this is what sets the flag
      const mockInstrument = vi.fn();
      integration.clientInstrumentation?.router?.({ instrument: mockInstrument });
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

    it('Framework Mode regression: isClientInstrumentationApiUsed returns false when router() is never called', () => {
      // This is a critical regression test for Framework Mode (e.g., Remix).
      //
      // Scenario:
      // 1. User sets useInstrumentationAPI: true in reactRouterTracingIntegration options
      // 2. createSentryClientInstrumentation() is called eagerly during SDK init
      // 3. BUT in Framework Mode, React Router doesn't support unstable_instrumentations,
      //    so router() method is NEVER called by the framework
      // 4. The SENTRY_CLIENT_INSTRUMENTATION_FLAG must NOT be set in this case
      // 5. isClientInstrumentationApiUsed() must return false
      // 6. This allows legacy instrumentation in hydratedRouter.ts to create navigation spans
      //
      // Without this behavior, Framework Mode would have ZERO navigation spans because:
      // - The flag would be set (disabling legacy instrumentation)
      // - But router() was never called (so instrumentation API doesn't create spans either)

      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      // Create integration with useInstrumentationAPI: true (simulating user config)
      const integration = reactRouterTracingIntegration({ useInstrumentationAPI: true });

      // Access the instrumentation (simulating what would happen during setup)
      const instrumentation = integration.clientInstrumentation;
      expect(instrumentation).toBeDefined();

      // CRITICAL: Flag is NOT set because router() was never called
      // This simulates Framework Mode where the framework doesn't call our hooks
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBeUndefined();

      // isClientInstrumentationApiUsed() returns false - legacy instrumentation will work
      expect(isClientInstrumentationApiUsed()).toBe(false);

      // Now simulate what happens in Library Mode: React Router calls router()
      const mockInstrument = vi.fn();
      instrumentation.router?.({ instrument: mockInstrument });

      // After router() is called, flag IS set and isClientInstrumentationApiUsed() returns true
      expect((GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_CLIENT_INSTRUMENTATION_FLAG]).toBe(true);
      expect(isClientInstrumentationApiUsed()).toBe(true);
    });
  });
});
