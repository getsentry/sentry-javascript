import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { SDK_VERSION } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSentryResource } from '../src/resource';
import { SDK_INFO } from '@opentelemetry/core';

describe('getSentryResource', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone env so mutations are isolated
    process.env = { ...originalEnv };
    delete process.env['OTEL_SERVICE_NAME'];
    delete process.env['OTEL_RESOURCE_ATTRIBUTES'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('uses serviceNameFallback when no env vars are set', () => {
    const resource = getSentryResource('node');
    expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('node');
  });

  it('uses OTEL_SERVICE_NAME over the fallback', () => {
    process.env['OTEL_SERVICE_NAME'] = 'my-service';
    const resource = getSentryResource('node');
    expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('my-service');
  });

  it('ignores empty OTEL_SERVICE_NAME and falls back to serviceNameFallback', () => {
    process.env['OTEL_SERVICE_NAME'] = '';
    const resource = getSentryResource('node');
    expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('node');
  });

  it('includes OTEL_RESOURCE_ATTRIBUTES key=value pairs', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'custom.key=custom-value,another.key=another-value';
    const resource = getSentryResource('node');
    expect(resource.attributes['custom.key']).toBe('custom-value');
    expect(resource.attributes['another.key']).toBe('another-value');
  });

  it('OTEL_RESOURCE_ATTRIBUTES can override service.name (but OTEL_SERVICE_NAME takes precedence over it)', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'service.name=from-attrs';
    const resource = getSentryResource('node');
    expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('from-attrs');
  });

  it('OTEL_SERVICE_NAME takes precedence over service.name from OTEL_RESOURCE_ATTRIBUTES', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'service.name=from-attrs';
    process.env['OTEL_SERVICE_NAME'] = 'from-service-name';
    const resource = getSentryResource('node');
    expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('from-service-name');
  });

  it('OTEL_RESOURCE_ATTRIBUTES can override service.namespace', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'service.namespace=my-namespace';
    const resource = getSentryResource('node');
    // eslint-disable-next-line deprecation/deprecation
    expect(resource.attributes[SEMRESATTRS_SERVICE_NAMESPACE]).toBe('my-namespace');
  });

  it('Sentry SDK telemetry attrs cannot be overridden by OTEL_RESOURCE_ATTRIBUTES', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] =
      'telemetry.sdk.name=evil,telemetry.sdk.language=evil,telemetry.sdk.version=0.0.0';
    const resource = getSentryResource('node');
    // not evil or 0.0.0
    expect(resource.attributes[ATTR_TELEMETRY_SDK_NAME]).toBe(SDK_INFO[ATTR_TELEMETRY_SDK_NAME]);
    expect(resource.attributes[ATTR_TELEMETRY_SDK_LANGUAGE]).toBe(SDK_INFO[ATTR_TELEMETRY_SDK_LANGUAGE]);
    expect(resource.attributes[ATTR_TELEMETRY_SDK_VERSION]).toBe(SDK_INFO[ATTR_TELEMETRY_SDK_VERSION]);
  });

  it('Sentry SDK telemetry attrs cannot be overridden by OTEL_SERVICE_NAME (service.version)', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'service.version=0.0.0';
    const resource = getSentryResource('node');
    expect(resource.attributes[ATTR_SERVICE_VERSION]).toBe(SDK_VERSION);
  });

  it('always includes Sentry SDK telemetry attributes', () => {
    const resource = getSentryResource('node');
    expect(resource.attributes[ATTR_TELEMETRY_SDK_LANGUAGE]).toBeDefined();
    expect(resource.attributes[ATTR_TELEMETRY_SDK_NAME]).toBeDefined();
    expect(resource.attributes[ATTR_TELEMETRY_SDK_VERSION]).toBeDefined();
    expect(resource.attributes[ATTR_SERVICE_VERSION]).toBe(SDK_VERSION);
  });

  it('always sets service.namespace to sentry by default', () => {
    const resource = getSentryResource('node');
    // eslint-disable-next-line deprecation/deprecation
    expect(resource.attributes[SEMRESATTRS_SERVICE_NAMESPACE]).toBe('sentry');
  });

  it('URL-decodes values in OTEL_RESOURCE_ATTRIBUTES', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'custom.key=hello%20world';
    const resource = getSentryResource('node');
    expect(resource.attributes['custom.key']).toBe('hello world');
  });

  it('handles malformed OTEL_RESOURCE_ATTRIBUTES gracefully (no = sign)', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'badentry,custom.key=value';
    expect(() => getSentryResource('node')).not.toThrow();
    const resource = getSentryResource('node');
    expect(resource.attributes['custom.key']).toBe('value');
  });

  it('handles empty OTEL_RESOURCE_ATTRIBUTES gracefully', () => {
    process.env['OTEL_RESOURCE_ATTRIBUTES'] = '';
    expect(() => getSentryResource('node')).not.toThrow();
  });

  it('does not crash when process is undefined', () => {
    const saved = global.process;
    // @ts-expect-error — simulating edge runtime where process may be undefined
    global.process = undefined;
    try {
      expect(() => getSentryResource('node')).not.toThrow();
    } finally {
      global.process = saved;
    }
  });
});
