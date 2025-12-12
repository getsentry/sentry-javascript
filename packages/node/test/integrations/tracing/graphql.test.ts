import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { INSTRUMENTED } from '@sentry/node-core';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { graphqlIntegration, instrumentGraphql } from '../../../src/integrations/tracing/graphql';

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
