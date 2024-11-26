import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';

import {
  _defaultDbStatementSerializer,
  instrumentMongo,
  mongoIntegration,
} from '../../../src/integrations/tracing/mongo';
import { INSTRUMENTED } from '../../../src/otel/instrument';

jest.mock('@opentelemetry/instrumentation-mongodb');

describe('Mongo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete INSTRUMENTED.Mongo;

    (MongoDBInstrumentation as unknown as jest.SpyInstance).mockImplementation(() => {
      return {
        setTracerProvider: () => undefined,
        setMeterProvider: () => undefined,
        getConfig: () => ({}),
        setConfig: () => ({}),
        enable: () => undefined,
      };
    });
  });

  it('defaults are correct for instrumentMongo', () => {
    instrumentMongo();

    expect(MongoDBInstrumentation).toHaveBeenCalledTimes(1);
    expect(MongoDBInstrumentation).toHaveBeenCalledWith({
      dbStatementSerializer: expect.any(Function),
      responseHook: expect.any(Function),
    });
  });

  it('defaults are correct for mongoIntegration', () => {
    mongoIntegration().setupOnce!();

    expect(MongoDBInstrumentation).toHaveBeenCalledTimes(1);
    expect(MongoDBInstrumentation).toHaveBeenCalledWith({
      responseHook: expect.any(Function),
      dbStatementSerializer: expect.any(Function),
    });
  });

  describe('_defaultDbStatementSerializer', () => {
    it('rewrites strings as ?', () => {
      const serialized = _defaultDbStatementSerializer({
        find: 'foo',
      });
      expect(JSON.parse(serialized).find).toBe('?');
    });

    it('rewrites nested strings as ?', () => {
      const serialized = _defaultDbStatementSerializer({
        find: {
          inner: 'foo',
        },
      });
      expect(JSON.parse(serialized).find.inner).toBe('?');
    });

    it('rewrites Buffer as ?', () => {
      const serialized = _defaultDbStatementSerializer({
        find: Buffer.from('foo', 'utf8'),
      });
      expect(JSON.parse(serialized).find).toBe('?');
    });
  });
});
