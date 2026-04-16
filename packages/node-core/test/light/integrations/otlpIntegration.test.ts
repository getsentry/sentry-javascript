import { hasExternalPropagationContext, registerExternalPropagationContext } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getOtlpTracesEndpoint, otlpIntegration } from '../../../src/light/integrations/otlpIntegration';
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

describe('getOtlpTracesEndpoint', () => {
  it('returns correct endpoint and headers from DSN', () => {
    const result = getOtlpTracesEndpoint('https://abc123@o0.ingest.sentry.io/456');

    expect(result).toEqual({
      url: 'https://o0.ingest.sentry.io/api/456/integration/otlp/v1/traces/',
      headers: {
        'X-Sentry-Auth': 'Sentry sentry_version=7, sentry_key=abc123',
      },
    });
  });

  it('handles DSN with port and path', () => {
    const result = getOtlpTracesEndpoint('https://key@sentry.example.com:9000/mypath/789');

    expect(result).toEqual({
      url: 'https://sentry.example.com:9000/mypath/api/789/integration/otlp/v1/traces/',
      headers: {
        'X-Sentry-Auth': 'Sentry sentry_version=7, sentry_key=key',
      },
    });
  });

  it('returns undefined for invalid DSN', () => {
    const result = getOtlpTracesEndpoint('not-a-dsn');
    expect(result).toBeUndefined();
  });
});
