import { afterEach, describe, expect, it } from 'vitest';
import { otlpIntegration } from '../../../src/light/integrations/otlpIntegration';
import { cleanupLightSdk, mockLightSdkInit } from '../../helpers/mockLightSdkInit';

describe('Light Mode | otlpIntegration', () => {
  afterEach(() => {
    cleanupLightSdk();
  });

  it('has correct integration name', () => {
    const integration = otlpIntegration();
    expect(integration.name).toBe('OtlpIntegration');
  });

  it('accepts empty options', () => {
    const integration = otlpIntegration();
    expect(integration.name).toBe('OtlpIntegration');
  });

  it('accepts all options', () => {
    const integration = otlpIntegration({
      setupOtlpTracesExporter: false,
      collectorUrl: 'https://my-collector.example.com/v1/traces',
    });
    expect(integration.name).toBe('OtlpIntegration');
  });

  describe('endpoint construction', () => {
    it('constructs correct endpoint from DSN', () => {
      const client = mockLightSdkInit({
        integrations: [otlpIntegration()],
      });

      const dsn = client?.getDsn();
      expect(dsn).toBeDefined();
      expect(dsn?.host).toBe('domain');
      expect(dsn?.projectId).toBe('123');
    });

    it('handles DSN with port and path', () => {
      const client = mockLightSdkInit({
        dsn: 'https://key@sentry.example.com:9000/mypath/456',
        integrations: [otlpIntegration()],
      });

      const dsn = client?.getDsn();
      expect(dsn?.host).toBe('sentry.example.com');
      expect(dsn?.port).toBe('9000');
      expect(dsn?.path).toBe('mypath');
      expect(dsn?.projectId).toBe('456');
    });
  });

  describe('auth header', () => {
    it('constructs correct X-Sentry-Auth header format with sentry_client', () => {
      const client = mockLightSdkInit({
        integrations: [otlpIntegration()],
      });

      const dsn = client?.getDsn();
      expect(dsn?.publicKey).toBe('username');

      const sdkInfo = client?.getSdkMetadata()?.sdk;
      expect(sdkInfo?.name).toBe('sentry.javascript.node-light');
      expect(sdkInfo?.version).toBeDefined();

      const expectedAuth = `Sentry sentry_version=7, sentry_key=${dsn?.publicKey}, sentry_client=${sdkInfo?.name}/${sdkInfo?.version}`;
      expect(expectedAuth).toMatch(
        /^Sentry sentry_version=7, sentry_key=username, sentry_client=sentry\.javascript\.node-light\/.+$/,
      );
    });
  });
});
