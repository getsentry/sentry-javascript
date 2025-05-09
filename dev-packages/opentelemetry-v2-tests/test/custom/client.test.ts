import { ProxyTracer } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('OpenTelemetryClient', () => {
  it('exposes a tracer', () => {
    const options = getDefaultTestClientOptions();
    const client = new TestClient(options);

    const tracer = client.tracer;
    expect(tracer).toBeDefined();
    expect(tracer).toBeInstanceOf(ProxyTracer);

    // Ensure we always get the same tracer instance
    const tracer2 = client.tracer;

    expect(tracer2).toBe(tracer);
  });
});
