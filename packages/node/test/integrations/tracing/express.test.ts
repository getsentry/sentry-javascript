import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { type MockInstance, beforeEach, describe, expect, it, vi } from 'vitest';
import { expressIntegration, instrumentExpress, instrumentExpressV5 } from '../../../src/integrations/tracing/express';
import { ExpressInstrumentationV5 } from '../../../src/integrations/tracing/express-v5/instrumentation';
import { INSTRUMENTED } from '../../../src/otel/instrument';

vi.mock('@opentelemetry/instrumentation-express');
vi.mock('../../../src/integrations/tracing/express-v5/instrumentation');

describe('Express', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete INSTRUMENTED.Express;
    delete INSTRUMENTED['Express-V5'];

    (ExpressInstrumentation as unknown as MockInstance).mockImplementation(() => {
      return {
        setTracerProvider: () => undefined,
        setMeterProvider: () => undefined,
        getConfig: () => ({}),
        setConfig: () => ({}),
        enable: () => undefined,
      };
    });

    (ExpressInstrumentationV5 as unknown as MockInstance).mockImplementation(() => {
      return {
        setTracerProvider: () => undefined,
        setMeterProvider: () => undefined,
        getConfig: () => ({}),
        setConfig: () => ({}),
        enable: () => undefined,
      };
    });
  });

  describe('instrumentExpress', () => {
    it('defaults are correct for instrumentExpress', () => {
      instrumentExpress({});

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: undefined,
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });

    it('passes ignoreLayers option to instrumentation', () => {
      instrumentExpress({ ignoreLayers: ['/health', /^\/internal/] });

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: ['/health', /^\/internal/],
        ignoreLayersType: undefined,
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });

    it('passes ignoreLayersType option to instrumentation', () => {
      instrumentExpress({ ignoreLayersType: ['middleware'] });

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: ['middleware'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });

    it('passes multiple ignoreLayersType values to instrumentation', () => {
      instrumentExpress({ ignoreLayersType: ['middleware', 'router'] });

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: ['middleware', 'router'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });

    it('passes both options to instrumentation', () => {
      instrumentExpress({
        ignoreLayers: ['/health'],
        ignoreLayersType: ['request_handler'],
      });

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: ['/health'],
        ignoreLayersType: ['request_handler'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });
  });

  describe('instrumentExpressV5', () => {
    it('defaults are correct for instrumentExpressV5', () => {
      instrumentExpressV5({});

      expect(ExpressInstrumentationV5).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentationV5).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: undefined,
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });

    it('passes options to instrumentExpressV5', () => {
      instrumentExpressV5({
        ignoreLayers: [(path: string) => path.startsWith('/admin')],
        ignoreLayersType: ['middleware', 'router'],
      });

      expect(ExpressInstrumentationV5).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentationV5).toHaveBeenCalledWith({
        ignoreLayers: [expect.any(Function)],
        ignoreLayersType: ['middleware', 'router'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });
  });

  describe('expressIntegration', () => {
    it('defaults are correct for expressIntegration', () => {
      expressIntegration().setupOnce!();

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: undefined,
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });

      expect(ExpressInstrumentationV5).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentationV5).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: undefined,
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });

    it('passes options from expressIntegration to both instrumentations', () => {
      expressIntegration({
        ignoreLayers: [/^\/api\/v1/],
        ignoreLayersType: ['middleware'],
      }).setupOnce!();

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: [/^\/api\/v1/],
        ignoreLayersType: ['middleware'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });

      expect(ExpressInstrumentationV5).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentationV5).toHaveBeenCalledWith({
        ignoreLayers: [/^\/api\/v1/],
        ignoreLayersType: ['middleware'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });

    it('passes all layer types from expressIntegration to instrumentation', () => {
      expressIntegration({
        ignoreLayersType: ['router', 'middleware', 'request_handler'],
      }).setupOnce!();

      expect(ExpressInstrumentation).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentation).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: ['router', 'middleware', 'request_handler'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });

      expect(ExpressInstrumentationV5).toHaveBeenCalledTimes(1);
      expect(ExpressInstrumentationV5).toHaveBeenCalledWith({
        ignoreLayers: undefined,
        ignoreLayersType: ['router', 'middleware', 'request_handler'],
        requestHook: expect.any(Function),
        spanNameHook: expect.any(Function),
      });
    });
  });
});
