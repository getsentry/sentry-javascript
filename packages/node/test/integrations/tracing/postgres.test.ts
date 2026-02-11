import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { INSTRUMENTED } from '@sentry/node-core';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { instrumentPostgres, postgresIntegration } from '../../../src/integrations/tracing/postgres';

vi.mock('@opentelemetry/instrumentation-pg');

describe('postgres integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete INSTRUMENTED.Postgres;

    (PgInstrumentation as unknown as MockInstance).mockImplementation(() => ({
      setTracerProvider: () => undefined,
      setMeterProvider: () => undefined,
      getConfig: () => ({}),
      setConfig: () => ({}),
      enable: () => undefined,
    }));
  });

  it('has a name and setupOnce method', () => {
    const integration = postgresIntegration();
    expect(integration.name).toBe('Postgres');
    expect(typeof integration.setupOnce).toBe('function');
  });

  it('passes ignoreConnectSpans: true to PgInstrumentation when set on integration', () => {
    postgresIntegration({ ignoreConnectSpans: true }).setupOnce!();

    expect(PgInstrumentation).toHaveBeenCalledTimes(1);
    expect(PgInstrumentation).toHaveBeenCalledWith({
      requireParentSpan: true,
      requestHook: expect.any(Function),
      ignoreConnectSpans: true,
    });
  });

  it('passes ignoreConnectSpans: false to PgInstrumentation by default', () => {
    postgresIntegration().setupOnce!();

    expect(PgInstrumentation).toHaveBeenCalledTimes(1);
    expect(PgInstrumentation).toHaveBeenCalledWith({
      requireParentSpan: true,
      requestHook: expect.any(Function),
      ignoreConnectSpans: false,
    });
  });

  it('instrumentPostgres receives ignoreConnectSpans option', () => {
    instrumentPostgres({ ignoreConnectSpans: true });

    expect(PgInstrumentation).toHaveBeenCalledTimes(1);
    expect(PgInstrumentation).toHaveBeenCalledWith({
      requireParentSpan: true,
      requestHook: expect.any(Function),
      ignoreConnectSpans: true,
    });
  });
});
