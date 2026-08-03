import type { RequestEventData, SpanAttributes } from '@sentry/core';
import { getIsolationScope, GLOBAL_OBJ } from '@sentry/core';
import type * as VercelEdgeModule from '@sentry/vercel-edge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';

// normally this is set as part of the build process, so mock it here
(GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewriteFramesDistDir: string })._sentryRewriteFramesDistDir = '.next';

type BeforeSamplingHandler = (data: { spanAttributes: SpanAttributes }) => void;

let beforeSamplingHandler: BeforeSamplingHandler | undefined;

vi.mock('@sentry/vercel-edge', async () => {
  const actual = (await vi.importActual('@sentry/vercel-edge')) as typeof VercelEdgeModule;
  return {
    ...actual,
    init: vi.fn(() => {
      return {
        // Capture the `beforeSampling` handler so we can invoke it directly in tests
        on: (hook: string, cb: unknown) => {
          if (hook === 'beforeSampling') {
            beforeSamplingHandler = cb as BeforeSamplingHandler;
          }
        },
        getOptions: () => ({}),
      };
    }),
  };
});

// Import after the mock is set up
const { init } = await import('../../src/edge');

function getNormalizedRequest(): RequestEventData | undefined {
  return getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest;
}

describe('edge beforeSampling handler', () => {
  beforeEach(() => {
    beforeSamplingHandler = undefined;
    init({});
    delete getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest;
  });

  afterEach(() => {
    delete getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest;
    vi.clearAllMocks();
  });

  it('registers a beforeSampling handler', () => {
    expect(beforeSamplingHandler).toBeTypeOf('function');
  });

  it('seeds normalizedRequest for Middleware.execute root spans', () => {
    beforeSamplingHandler!({
      spanAttributes: {
        [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute',
        'http.method': 'GET',
        'http.target': '/api/endpoint-behind-middleware?query=123',
      },
    });

    expect(getNormalizedRequest()).toEqual({
      method: 'GET',
      url: '/api/endpoint-behind-middleware?query=123',
      query_string: 'query=123',
    });
  });

  it('seeds normalizedRequest for BaseServer.handleRequest root spans', () => {
    beforeSamplingHandler!({
      spanAttributes: {
        [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest',
        'http.method': 'POST',
        'http.target': '/foo',
      },
    });

    expect(getNormalizedRequest()).toEqual({
      method: 'POST',
      url: '/foo',
    });
  });

  it('overwrites stale normalizedRequest from a previous invocation', () => {
    getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: { method: 'GET', url: '/previous-request' },
    });

    beforeSamplingHandler!({
      spanAttributes: {
        [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute',
        'http.method': 'POST',
        'http.target': '/current-request?a=1',
      },
    });

    expect(getNormalizedRequest()).toEqual({
      method: 'POST',
      url: '/current-request?a=1',
      query_string: 'a=1',
    });
  });

  it('does not keep stale fields when the new request yields a partial normalizedRequest', () => {
    getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: { method: 'GET', url: '/previous-request?a=1', query_string: 'a=1' },
    });

    beforeSamplingHandler!({
      spanAttributes: {
        [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute',
        'http.method': 'POST',
        'http.target': '/current-request',
      },
    });

    expect(getNormalizedRequest()).toEqual({
      method: 'POST',
      url: '/current-request',
    });
  });

  it('is a no-op for non-request span types', () => {
    beforeSamplingHandler!({
      spanAttributes: {
        [ATTR_NEXT_SPAN_TYPE]: 'Render.getServerSideProps',
        'http.method': 'GET',
        'http.target': '/foo',
      },
    });

    expect(getNormalizedRequest()).toBeUndefined();
  });

  it('clears stale normalizedRequest when there are no usable HTTP attributes', () => {
    getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: { method: 'GET', url: '/previous-request' },
    });

    beforeSamplingHandler!({
      spanAttributes: {
        [ATTR_NEXT_SPAN_TYPE]: 'Middleware.execute',
      },
    });

    expect(getNormalizedRequest()).toBeUndefined();
  });
});
