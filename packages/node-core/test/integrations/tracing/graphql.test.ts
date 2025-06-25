import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { type MockInstance, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlIntegration, instrumentGraphql } from '../../../src/integrations/tracing/graphql';
import { INSTRUMENTED } from '../../../src/otel/instrument';

vi.mock('@opentelemetry/instrumentation-graphql');

describe('GraphQL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete INSTRUMENTED.Graphql;

    (GraphQLInstrumentation as unknown as MockInstance).mockImplementation(() => {
      return {
        setTracerProvider: () => undefined,
        setMeterProvider: () => undefined,
        getConfig: () => ({}),
        setConfig: () => ({}),
        enable: () => undefined,
      };
    });
  });

  it('defaults are correct for instrumentGraphql', () => {
    instrumentGraphql({ ignoreTrivialResolveSpans: false });

    expect(GraphQLInstrumentation).toHaveBeenCalledTimes(1);
    expect(GraphQLInstrumentation).toHaveBeenCalledWith({
      ignoreResolveSpans: true,
      ignoreTrivialResolveSpans: false,
      useOperationNameForRootSpan: true,
      responseHook: expect.any(Function),
    });
  });

  it('defaults are correct for _graphqlIntegration', () => {
    graphqlIntegration({ ignoreTrivialResolveSpans: false }).setupOnce!();

    expect(GraphQLInstrumentation).toHaveBeenCalledTimes(1);
    expect(GraphQLInstrumentation).toHaveBeenCalledWith({
      ignoreResolveSpans: true,
      ignoreTrivialResolveSpans: false,
      useOperationNameForRootSpan: true,
      responseHook: expect.any(Function),
    });
  });
});
