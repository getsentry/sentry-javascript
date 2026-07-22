import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { KoaInstrumentation } from '../../../src/integrations/tracing/koa/vendored/instrumentation';
import { INSTRUMENTED } from '../../../src/otel/instrument';
import { koaChannelIntegration as koaIntegration } from '@sentry/server-utils/orchestrion';
import { instrumentKoa } from '../../../src/integrations/tracing/koa';
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

  // `koaIntegration()` is now the channel-based (orchestrion) integration by default; it no longer
  // sets up the vendored OTel `KoaInstrumentation`. The channel subscriber's span behavior is covered
  // in `@sentry/server-utils` and the node-integration koa suite. Here we only assert the public
  // factory keeps the `Koa` name so the default-integration set and user overrides stay aligned.
  it('koaIntegration is the channel integration with the Koa name', () => {
    expect(koaIntegration().name).toBe('Koa');
    expect(koaIntegration({ ignoreLayersType: ['middleware'] }).name).toBe('Koa');
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
