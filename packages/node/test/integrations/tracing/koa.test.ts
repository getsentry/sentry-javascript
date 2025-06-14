import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { type MockInstance, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentKoa, koaIntegration } from '../../../src/integrations/tracing/koa';
import { INSTRUMENTED } from '../../../src/otel/instrument';

vi.mock('@opentelemetry/instrumentation-koa');

describe('Koa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete INSTRUMENTED.Koa;

    (KoaInstrumentation as unknown as MockInstance).mockImplementation(() => {
      return {
        setTracerProvider: () => undefined,
        setMeterProvider: () => undefined,
        getConfig: () => ({}),
        setConfig: () => ({}),
        enable: () => undefined,
      };
    });
  });

  it('defaults are correct for instrumentKoa', () => {
    instrumentKoa({});

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: undefined,
      requestHook: expect.any(Function),
    });
  });

  it('passes ignoreLayersType option to instrumentation', () => {
    instrumentKoa({ ignoreLayersType: ['middleware'] });

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['middleware'],
      requestHook: expect.any(Function),
    });
  });

  it('passes multiple ignoreLayersType values to instrumentation', () => {
    instrumentKoa({ ignoreLayersType: ['middleware', 'router'] });

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['middleware', 'router'],
      requestHook: expect.any(Function),
    });
  });

  it('defaults are correct for koaIntegration', () => {
    koaIntegration().setupOnce!();

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: undefined,
      requestHook: expect.any(Function),
    });
  });

  it('passes options from koaIntegration to instrumentation', () => {
    koaIntegration({ ignoreLayersType: ['middleware'] }).setupOnce!();

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['middleware'],
      requestHook: expect.any(Function),
    });
  });

  it('passes multiple options from koaIntegration to instrumentation', () => {
    koaIntegration({ ignoreLayersType: ['router', 'middleware'] }).setupOnce!();

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['router', 'middleware'],
      requestHook: expect.any(Function),
    });
  });
});
