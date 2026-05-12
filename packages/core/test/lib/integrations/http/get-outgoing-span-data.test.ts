import { describe, expect, it, vi } from 'vitest';
import {
  getOutgoingRequestSpanData,
  setIncomingResponseSpanData,
} from '../../../../src/integrations/http/get-outgoing-span-data';
import type { HttpClientRequest, HttpIncomingMessage } from '../../../../src/integrations/http/types';
import type { Span } from '../../../../src/types-hoist/span';

function makeMockRequest(overrides: Partial<Record<string, unknown>> = {}): HttpClientRequest {
  return {
    method: 'GET',
    path: '/api/test',
    host: 'example.com',
    protocol: 'http:',
    port: 80,
    getHeader: vi.fn(() => undefined),
    getHeaders: vi.fn(() => ({})),
    setHeader: vi.fn(),
    removeHeader: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    prependListener: vi.fn(),
    listenerCount: vi.fn(() => 0),
    removeListener: vi.fn(),
    ...overrides,
  } as unknown as HttpClientRequest;
}

function makeMockResponse(overrides: Partial<HttpIncomingMessage> = {}): HttpIncomingMessage {
  return {
    statusCode: 200,
    statusMessage: 'OK',
    httpVersion: '1.1',
    headers: {},
    socket: undefined,
    resume: vi.fn(),
    on: vi.fn(),
    addListener: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  } as unknown as HttpIncomingMessage;
}

describe('getOutgoingRequestSpanData', () => {
  it('returns onlyIfParent: true', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest());
    expect(result.onlyIfParent).toBe(true);
  });

  it('sets sentry.op to "http.client"', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest());
    expect(result.attributes!['sentry.op']).toBe('http.client');
  });

  it('sets otel.kind to "CLIENT"', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest());
    expect(result.attributes!['otel.kind']).toBe('CLIENT');
  });

  it('builds the span name from method and URL', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest({ method: 'POST' }));
    expect(result.name).toMatch(/^POST /);
  });

  it('includes http.url, http.method, http.target, net.peer.name', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest());
    expect(result.attributes).toMatchObject({
      'http.url': 'http://example.com/api/test',
      'http.method': 'GET',
      'http.target': '/api/test',
      'net.peer.name': 'example.com',
    });
  });

  it('falls back to "/" for http.target when path is not set', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest({ path: undefined }));
    expect(result.attributes!['http.target']).toBe('/');
  });

  it('includes user_agent.original when user-agent header is set', () => {
    const request = makeMockRequest({
      getHeader: (name: string) => (name === 'user-agent' ? 'Mozilla/5.0' : undefined),
    });
    const result = getOutgoingRequestSpanData(request);
    expect(result.attributes!['user_agent.original']).toBe('Mozilla/5.0');
  });

  it('omits user_agent.original when user-agent header is absent', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest());
    expect(result.attributes).not.toHaveProperty('user_agent.original');
  });

  it('includes non-standard port in the URL', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest({ port: 3000 }));
    expect(result.attributes!['http.url']).toContain(':3000');
  });
});

describe('setIncomingResponseSpanData', () => {
  function makeMockSpan(): Span & { setAttributes: ReturnType<typeof vi.fn> } {
    return { setAttributes: vi.fn() } as unknown as Span & { setAttributes: ReturnType<typeof vi.fn> };
  }

  it('sets http.response.status_code from statusCode', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ statusCode: 201 }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ 'http.response.status_code': 201 }));
  });

  it('sets network.protocol.version and http.flavor from httpVersion', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ httpVersion: '2.0' }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'network.protocol.version': '2.0', 'http.flavor': '2.0' }),
    );
  });

  it('sets http.status_text from statusMessage', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ statusMessage: 'Created' }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ 'http.status_text': 'CREATED' }));
  });

  it('uses ip_tcp transport for non-QUIC connections', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ httpVersion: '1.1' }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'network.transport': 'ip_tcp', 'net.transport': 'ip_tcp' }),
    );
  });

  it('uses ip_udp transport for QUIC connections', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ httpVersion: 'QUIC' }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'network.transport': 'ip_udp', 'net.transport': 'ip_udp' }),
    );
  });

  it('includes socket address and port attributes when socket is present', () => {
    const span = makeMockSpan();
    const response = makeMockResponse({
      socket: { remoteAddress: '1.2.3.4', remotePort: 12345 },
    });
    setIncomingResponseSpanData(response, span);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'network.peer.address': '1.2.3.4',
        'network.peer.port': 12345,
        'net.peer.ip': '1.2.3.4',
        'net.peer.port': 12345,
      }),
    );
  });

  it('includes uncompressed content-length when content-encoding is identity', () => {
    const span = makeMockSpan();
    const response = makeMockResponse({
      headers: { 'content-length': '42', 'content-encoding': 'identity' },
    });
    setIncomingResponseSpanData(response, span);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'http.response_content_length_uncompressed': 42 }),
    );
  });

  it('includes compressed content-length when content-encoding is gzip', () => {
    const span = makeMockSpan();
    const response = makeMockResponse({
      headers: { 'content-length': '100', 'content-encoding': 'gzip' },
    });
    setIncomingResponseSpanData(response, span);
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ 'http.response_content_length': 100 }));
  });
});
