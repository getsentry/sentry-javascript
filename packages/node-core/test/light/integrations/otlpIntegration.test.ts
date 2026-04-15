import { hasExternalPropagationContext, registerExternalPropagationContext } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { otlpIntegration } from '../../../src/light/integrations/otlpIntegration';
import { cleanupLightSdk, mockLightSdkInit } from '../../helpers/mockLightSdkInit';

describe('Light Mode | otlpIntegration', () => {
  afterEach(() => {
    cleanupLightSdk();
    // Reset external propagation context
    registerExternalPropagationContext(() => undefined);
  });

  it('has correct integration name', () => {
    const integration = otlpIntegration();
    expect(integration.name).toBe('OtlpIntegration');
  });

  it('registers external propagation context on setup', () => {
    mockLightSdkInit({
      integrations: [otlpIntegration()],
    });

    expect(hasExternalPropagationContext()).toBe(true);
  });
});
