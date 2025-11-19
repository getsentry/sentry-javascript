import * as sentryBrowser from '@sentry/browser';
import type { Client } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as hydratedRouterModule from '../../src/client/hydratedRouter';
import { reactRouterTracingIntegration } from '../../src/client/tracingIntegration';

describe('reactRouterTracingIntegration', () => {
  afterEach(() => {
    vi.clearAllMocks();
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
});
