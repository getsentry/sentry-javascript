import { KoaInstrumentation } from '../../../src/integrations/tracing/koa/vendored/instrumentation';
import { INSTRUMENTED } from '@sentry/node-core';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { instrumentKoa, koaIntegration } from '../../../src/integrations/tracing/koa';
import { isLayerIgnored } from '../../../src/integrations/tracing/koa/vendored/utils';
import { KoaLayerType, type KoaInstrumentationConfig } from '../../../src/integrations/tracing/koa/vendored/types';

vi.mock('../../../src/integrations/tracing/koa/vendored/instrumentation');

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
    });
  });

  it('passes ignoreLayersType option to instrumentation', () => {
    instrumentKoa({ ignoreLayersType: ['middleware'] });

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['middleware'],
    });
  });

  it('passes multiple ignoreLayersType values to instrumentation', () => {
    instrumentKoa({ ignoreLayersType: ['middleware', 'router'] });

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['middleware', 'router'],
    });
  });

  it('defaults are correct for koaIntegration', () => {
    koaIntegration().setupOnce!();

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: undefined,
    });
  });

  it('passes options from koaIntegration to instrumentation', () => {
    koaIntegration({ ignoreLayersType: ['middleware'] }).setupOnce!();

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['middleware'],
    });
  });

  it('passes multiple options from koaIntegration to instrumentation', () => {
    koaIntegration({ ignoreLayersType: ['router', 'middleware'] }).setupOnce!();

    expect(KoaInstrumentation).toHaveBeenCalledTimes(1);
    expect(KoaInstrumentation).toHaveBeenCalledWith({
      ignoreLayersType: ['router', 'middleware'],
    });
  });
});

describe('isLayerIgnored', () => {
  it('does not fail with invalid config', () => {
    expect(isLayerIgnored(KoaLayerType.MIDDLEWARE)).toBe(false);
    expect(isLayerIgnored(KoaLayerType.MIDDLEWARE, {} as KoaInstrumentationConfig)).toBe(false);
    expect(isLayerIgnored(KoaLayerType.MIDDLEWARE, { ignoreLayersType: {} } as KoaInstrumentationConfig)).toBe(false);
    expect(isLayerIgnored(KoaLayerType.ROUTER, { ignoreLayersType: {} } as KoaInstrumentationConfig)).toBe(false);
  });

  it('ignores based on type', () => {
    expect(isLayerIgnored(KoaLayerType.MIDDLEWARE, { ignoreLayersType: [KoaLayerType.MIDDLEWARE] })).toBe(true);
    expect(isLayerIgnored(KoaLayerType.ROUTER, { ignoreLayersType: [KoaLayerType.MIDDLEWARE] })).toBe(false);
  });
});
