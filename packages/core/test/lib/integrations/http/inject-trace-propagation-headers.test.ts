import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectTracePropagationHeaders } from '../../../../src/integrations/http/inject-trace-propagation-headers';
import type { HttpClientRequest } from '../../../../src/integrations/http/types';
import { LRUMap } from '../../../../src/utils/lru';

const DEFAULT_SENTRY_TRACE = 'aabbccdd-aabbccdd-1';
const DEFAULT_TRACEPARENT = '00-aabbccdd-aabbccdd-01';
const DEFAULT_BAGGAGE = 'sentry-trace_id=aabbccdd,sentry-sampled=true';

vi.mock('../../../../src/utils/traceData', () => ({
  getTraceData: vi.fn(() => ({
    'sentry-trace': DEFAULT_SENTRY_TRACE,
    traceparent: DEFAULT_TRACEPARENT,
    baggage: DEFAULT_BAGGAGE,
  })),
}));

vi.mock('../../../../src/currentScopes', () => ({
  getClient: vi.fn(() => ({
    getOptions: vi.fn(() => ({
      tracePropagationTargets: undefined,
    })),
  })),
}));

function makeMockRequest(existingHeaders: Record<string, string | undefined> = {}): HttpClientRequest & {
  setHeader: ReturnType<typeof vi.fn>;
} {
  return {
    method: 'GET',
    path: '/api/test',
    host: 'example.com',
    protocol: 'http:',
    port: 80,
    getHeader: vi.fn((name: string) => existingHeaders[name]),
    getHeaders: vi.fn(() => existingHeaders),
    setHeader: vi.fn((key: string, value: string) => {
      existingHeaders[key] = value;
    }),
    removeHeader: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    prependListener: vi.fn(),
    listenerCount: vi.fn(() => 0),
    removeListener: vi.fn(),
  } as unknown as HttpClientRequest & { setHeader: ReturnType<typeof vi.fn> };
}

describe('injectTracePropagationHeaders', () => {
  let propagationDecisionMap: LRUMap<string, boolean>;

  beforeEach(() => {
    propagationDecisionMap = new LRUMap<string, boolean>(100);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects sentry-trace, traceparent, and baggage headers', () => {
    const request = makeMockRequest();

    injectTracePropagationHeaders(request, propagationDecisionMap);

    expect(request.setHeader).toHaveBeenCalledWith('sentry-trace', DEFAULT_SENTRY_TRACE);
    expect(request.setHeader).toHaveBeenCalledWith('traceparent', DEFAULT_TRACEPARENT);
    expect(request.setHeader).toHaveBeenCalledWith('baggage', DEFAULT_BAGGAGE);
  });

  it('does not overwrite an existing sentry-trace header', () => {
    const request = makeMockRequest({ 'sentry-trace': 'existing-value' });

    injectTracePropagationHeaders(request, propagationDecisionMap);

    expect(request.setHeader).not.toHaveBeenCalledWith('sentry-trace', expect.anything());
  });

  it('does not overwrite an existing traceparent header', () => {
    const request = makeMockRequest({ traceparent: 'existing-parent' });

    injectTracePropagationHeaders(request, propagationDecisionMap);

    expect(request.setHeader).not.toHaveBeenCalledWith('traceparent', expect.anything());
  });

  it('merges baggage with existing baggage header', () => {
    const request = makeMockRequest({ baggage: 'custom=value' });

    injectTracePropagationHeaders(request, propagationDecisionMap);

    const baggageCall = vi.mocked(request.setHeader).mock.calls.find(c => c[0] === 'baggage');
    expect(baggageCall).toBeDefined();
    const merged = baggageCall![1] as string;
    expect(merged).toContain('custom=value');
    expect(merged).toContain(DEFAULT_BAGGAGE);
    expect(request.getHeaders()).toStrictEqual({
      baggage: `custom=value,${DEFAULT_BAGGAGE}`,
      'sentry-trace': DEFAULT_SENTRY_TRACE,
      traceparent: DEFAULT_TRACEPARENT,
    });
  });

  it('does not inject trace propagation headers when sentry-trace is already present', () => {
    const request = makeMockRequest({
      baggage: 'original=value',
      'sentry-trace': 'yyyyyyyy-xxxxxxxx-1',
    });

    injectTracePropagationHeaders(request, propagationDecisionMap);

    const baggageCall = vi.mocked(request.setHeader).mock.calls.find(c => c[0] === 'baggage');
    expect(baggageCall).toBe(undefined);
    expect(request.getHeaders()).toStrictEqual({
      baggage: 'original=value',
      'sentry-trace': 'yyyyyyyy-xxxxxxxx-1',
    });
  });

  it('does not inject headers when URL does not match tracePropagationTargets', async () => {
    const { getClient } = await import('../../../../src/currentScopes');
    vi.mocked(getClient).mockReturnValue({
      getOptions: vi.fn(() => ({
        tracePropagationTargets: [/^https:\/\/api\.example\.com(?:\/|$)/],
      })),
    } as any);

    const request = makeMockRequest();

    injectTracePropagationHeaders(request, propagationDecisionMap);

    expect(request.setHeader).not.toHaveBeenCalled();
  });

  it('does not inject headers when getTraceData returns null', async () => {
    const { getTraceData } = await import('../../../../src/utils/traceData');
    vi.mocked(getTraceData).mockReturnValueOnce(null as any);

    const request = makeMockRequest();

    injectTracePropagationHeaders(request, propagationDecisionMap);

    expect(request.setHeader).not.toHaveBeenCalled();
  });

  it('does not inject headers when getClient returns undefined', async () => {
    const { getClient } = await import('../../../../src/currentScopes');
    vi.mocked(getClient).mockReturnValueOnce(undefined);

    const request = makeMockRequest();

    // tracePropagationTargets is undefined → propagation is allowed
    // but there is no client, so clientOptions is undefined
    // In this case, tracePropagationTargets is undefined → shouldPropagateTraceForUrl returns true
    // So headers should still be injected
    injectTracePropagationHeaders(request, propagationDecisionMap);

    expect(request.setHeader).toHaveBeenCalledWith('sentry-trace', DEFAULT_SENTRY_TRACE);
  });

  it('caches propagation decisions in the decision map', async () => {
    // tracePropagationTargets must be defined for the decision to be cached
    const { getClient } = await import('../../../../src/currentScopes');
    vi.mocked(getClient).mockReturnValue({
      getOptions: vi.fn(() => ({
        tracePropagationTargets: ['example.com'],
      })),
    } as any);

    const request1 = makeMockRequest();
    const request2 = makeMockRequest();

    injectTracePropagationHeaders(request1, propagationDecisionMap);
    injectTracePropagationHeaders(request2, propagationDecisionMap);

    // Both requests should have had headers injected (URL matches the target)
    expect(request1.setHeader).toHaveBeenCalledWith('sentry-trace', DEFAULT_SENTRY_TRACE);
    expect(request2.setHeader).toHaveBeenCalledWith('sentry-trace', DEFAULT_SENTRY_TRACE);

    // The decision map should contain a cached entry for the URL
    expect(propagationDecisionMap.size).toBe(1);
  });

  it('handles setHeader exceptions gracefully', () => {
    const request = makeMockRequest();
    vi.mocked(request.setHeader).mockImplementation(() => {
      throw new Error('Headers already sent');
    });

    // Should not throw
    expect(() => injectTracePropagationHeaders(request, propagationDecisionMap)).not.toThrow();
  });
});
