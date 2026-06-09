import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SentrySampler } from '../../src/sampler';
import { SentrySpanProcessor } from '../../src/spanProcessor';
import { SentryTraceProvider } from '../../src/sentryTraceProvider';
import { openTelemetrySetupCheck, setIsSetup } from '../../src/utils/setupCheck';
import { setupOtel } from '../helpers/initOtel';
import { cleanupOtel } from '../helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('openTelemetrySetupCheck', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    cleanupOtel(provider);
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  it('returns empty array by default', () => {
    const setup = openTelemetrySetupCheck();
    expect(setup).toEqual([]);
  });

  it('returns all setup parts', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    [provider] = setupOtel(client);

    const setup = openTelemetrySetupCheck();
    expect(setup).toEqual(['SentrySpanProcessor', 'SentrySampler', 'SentryPropagator', 'SentryContextManager']);
  });

  it('returns partial setup parts', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    provider = new BasicTracerProvider({
      sampler: new SentrySampler(client),
      spanProcessors: [new SentrySpanProcessor()],
    });

    const setup = openTelemetrySetupCheck();
    expect(setup).toEqual(['SentrySampler', 'SentrySpanProcessor']);
  });

  it('does not mark SentryTraceProvider as set up on construction', () => {
    // Construction must not mark setup — that only happens once the provider is
    // successfully registered as the global tracer provider. Otherwise setup
    // validation would skip required checks even when registration failed.
    new SentryTraceProvider();

    expect(openTelemetrySetupCheck()).toEqual([]);
  });

  it('returns SentryTraceProvider setup once it is marked as set up', () => {
    setIsSetup('SentryTraceProvider');

    const setup = openTelemetrySetupCheck();
    expect(setup).toEqual(['SentryTraceProvider']);
  });
});
