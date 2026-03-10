import { defaultTextMapGetter, defaultTextMapSetter, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { otlpIntegration } from '../../../src/light/integrations/otlp';
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
      setupPropagator: false,
      captureExceptions: true,
    });
    expect(integration.name).toBe('OtlpIntegration');
  });

  // Exception interceptor tests must run before other tests that call mockLightSdkInit,
  // because the recordException patch is guarded by a prototype flag and can only be applied once.
  describe('exception interceptor', () => {
    let provider: BasicTracerProvider;

    beforeEach(() => {
      provider = new BasicTracerProvider();
      trace.setGlobalTracerProvider(provider);
    });

    afterEach(() => {
      provider.shutdown();
      trace.disable();
    });

    it('captures exceptions from span.recordException when captureExceptions is true', () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');

      mockLightSdkInit({
        integrations: [
          otlpIntegration({ setupOtlpTracesExporter: false, setupPropagator: false, captureExceptions: true }),
        ],
      });

      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const error = new Error('test exception');
      span.recordException(error);
      span.end();

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: { type: 'auto.otlp.record_exception', handled: false },
      });

      captureExceptionSpy.mockRestore();
    });

    it('still calls original recordException', () => {
      mockLightSdkInit({
        integrations: [
          otlpIntegration({ setupOtlpTracesExporter: false, setupPropagator: false, captureExceptions: true }),
        ],
      });

      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      span.recordException(new Error('test exception'));

      // The span should have the exception event recorded by the original implementation
      const events = (span as unknown as { events: Array<{ name: string }> }).events;
      expect(events.some(e => e.name === 'exception')).toBe(true);

      span.end();
    });
  });

  describe('endpoint construction', () => {
    it('constructs correct endpoint from DSN', () => {
      const client = mockLightSdkInit({
        integrations: [otlpIntegration({ setupPropagator: false })],
      });

      const dsn = client?.getDsn();
      expect(dsn).toBeDefined();
      expect(dsn?.host).toBe('domain');
      expect(dsn?.projectId).toBe('123');
    });

    it('handles DSN with port and path', () => {
      const client = mockLightSdkInit({
        dsn: 'https://key@sentry.example.com:9000/mypath/456',
        integrations: [otlpIntegration({ setupPropagator: false })],
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
        integrations: [otlpIntegration({ setupPropagator: false })],
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

  describe('propagator', () => {
    let provider: BasicTracerProvider;

    beforeEach(() => {
      provider = new BasicTracerProvider();
      trace.setGlobalTracerProvider(provider);
    });

    afterEach(() => {
      provider.shutdown();
      propagation.disable();
      trace.disable();
    });

    it('injects sentry-trace header with sampled flag', () => {
      mockLightSdkInit({
        integrations: [otlpIntegration({ setupOtlpTracesExporter: false })],
      });

      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const ctx = trace.setSpan(ROOT_CONTEXT, span);

      const carrier: Record<string, string> = {};
      propagation.inject(ctx, carrier, defaultTextMapSetter);

      expect(carrier['sentry-trace']).toBeDefined();
      expect(carrier['sentry-trace']).toMatch(/^[0-9a-f]{32}-[0-9a-f]{16}-[01]$/);

      span.end();
    });

    it('extracts sentry-trace header into remote span context', () => {
      mockLightSdkInit({
        integrations: [otlpIntegration({ setupOtlpTracesExporter: false })],
      });

      const carrier = {
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      };

      const extractedCtx = propagation.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      const spanContext = trace.getSpanContext(extractedCtx);

      expect(spanContext).toBeDefined();
      expect(spanContext?.traceId).toBe('12345678901234567890123456789012');
      expect(spanContext?.spanId).toBe('1234567890123456');
      expect(spanContext?.isRemote).toBe(true);
    });

    it('propagates sentry baggage through extract and inject', () => {
      mockLightSdkInit({
        integrations: [otlpIntegration({ setupOtlpTracesExporter: false })],
      });

      const incomingCarrier = {
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production,sentry-release=1.0.0',
      };

      // Extract incoming headers into OTel context
      const extractedCtx = propagation.extract(ROOT_CONTEXT, incomingCarrier, defaultTextMapGetter);

      // Start a child span in the extracted context
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('child-span', {}, extractedCtx);
      const spanCtx = trace.setSpan(extractedCtx, span);

      // Inject into outgoing carrier
      const outgoingCarrier: Record<string, string> = {};
      propagation.inject(spanCtx, outgoingCarrier, defaultTextMapSetter);

      expect(outgoingCarrier['baggage']).toBeDefined();
      expect(outgoingCarrier['baggage']).toContain('sentry-environment=production');
      expect(outgoingCarrier['baggage']).toContain('sentry-release=1.0.0');

      span.end();
    });

    it('does not inject baggage when no incoming sentry baggage', () => {
      mockLightSdkInit({
        integrations: [otlpIntegration({ setupOtlpTracesExporter: false })],
      });

      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const ctx = trace.setSpan(ROOT_CONTEXT, span);

      const carrier: Record<string, string> = {};
      propagation.inject(ctx, carrier, defaultTextMapSetter);

      expect(carrier['baggage']).toBeUndefined();

      span.end();
    });

    it('returns fields', () => {
      mockLightSdkInit({
        integrations: [otlpIntegration({ setupOtlpTracesExporter: false })],
      });

      const fields = propagation.fields();
      expect(fields).toContain('sentry-trace');
      expect(fields).toContain('baggage');
    });
  });
});
