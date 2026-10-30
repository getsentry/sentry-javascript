import { getCurrentScope, withScope } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { continueCloudflareTrace } from '../../src/utils/cloudflareTrace';

const CLOUDFLARE_TRACE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const CLOUDFLARE_SPAN_ID = 'b1c2d3e4f5a60718';

describe('continueCloudflareTrace()', () => {
  it('continues the trace of a traced Cloudflare span', () => {
    const context = {
      tracing: {
        getActiveSpan: () => ({
          isTraced: true,
          spanContext: () => ({ traceId: CLOUDFLARE_TRACE_ID, spanId: CLOUDFLARE_SPAN_ID, traceFlags: 1 }),
        }),
      },
    };

    withScope(() => {
      continueCloudflareTrace(context);

      expect(getCurrentScope().getPropagationContext()).toEqual({
        traceId: CLOUDFLARE_TRACE_ID,
        parentSpanId: CLOUDFLARE_SPAN_ID,
        sampleRand: expect.any(Number),
      });
    });
  });

  it('keeps the propagation context when the scope continues a trace', () => {
    const context = {
      tracing: {
        getActiveSpan: () => ({
          isTraced: true,
          spanContext: () => ({ traceId: CLOUDFLARE_TRACE_ID, spanId: CLOUDFLARE_SPAN_ID, traceFlags: 1 }),
        }),
      },
    };

    withScope(scope => {
      scope.setPropagationContext({
        traceId: '12345678901234567890123456789012',
        parentSpanId: '1234567890123456',
        sampleRand: 0.5,
      });
      const propagationContext = scope.getPropagationContext();

      continueCloudflareTrace(context);

      expect(scope.getPropagationContext()).toBe(propagationContext);
    });
  });

  it.each([
    ['there is no execution context', undefined],
    ['the runtime has no tracing API', {}],
    ['the runtime has no getActiveSpan', { tracing: {} }],
    ['there is no active span', { tracing: { getActiveSpan: () => undefined } }],
    [
      'the runtime has no spanContext',
      {
        tracing: { getActiveSpan: () => ({ isTraced: true }) },
      },
    ],
    [
      'Cloudflare does not trace the invocation',
      {
        tracing: {
          getActiveSpan: () => ({
            isTraced: false,
            spanContext: () => ({ traceId: CLOUDFLARE_TRACE_ID, spanId: CLOUDFLARE_SPAN_ID, traceFlags: 0 }),
          }),
        },
      },
    ],
    [
      'the span context has null ids',
      {
        tracing: {
          getActiveSpan: () => ({
            isTraced: true,
            spanContext: () => ({ traceId: '0'.repeat(32), spanId: '0'.repeat(16), traceFlags: 0 }),
          }),
        },
      },
    ],
    [
      'the span context has a malformed trace id',
      {
        tracing: {
          getActiveSpan: () => ({
            isTraced: true,
            spanContext: () => ({ traceId: 'not-a-trace-id', spanId: CLOUDFLARE_SPAN_ID, traceFlags: 1 }),
          }),
        },
      },
    ],
    [
      'the span context has a malformed span id',
      {
        tracing: {
          getActiveSpan: () => ({
            isTraced: true,
            spanContext: () => ({ traceId: CLOUDFLARE_TRACE_ID, spanId: 'B1C2D3E4F5A60718', traceFlags: 1 }),
          }),
        },
      },
    ],
    [
      'reading the active span throws',
      {
        tracing: {
          getActiveSpan: () => {
            throw new Error('torn down');
          },
        },
      },
    ],
  ])('keeps the propagation context when %s', (_, context) => {
    withScope(scope => {
      const propagationContext = scope.getPropagationContext();

      continueCloudflareTrace(context);

      expect(scope.getPropagationContext()).toBe(propagationContext);
    });
  });
});
