import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../../src/client';
import * as currentScopes from '../../../../src/currentScopes';
import {
  getOutgoingRequestSpanData,
  setIncomingResponseSpanData,
} from '../../../../src/integrations/http/get-outgoing-span-data';
import type { HttpClientRequest, HttpIncomingMessage } from '../../../../src/integrations/http/types';
import type { Span } from '../../../../src/types/span';
import {
  HTTP_REQUEST_METHOD,
  NETWORK_LOCAL_ADDRESS,
  NETWORK_LOCAL_PORT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_TRANSPORT,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
  URL_PATH,
} from '@sentry/conventions/attributes';

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

  it('sets sentry.kind to "CLIENT"', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest());
    expect(result.attributes!['sentry.kind']).toBe('client');
  });

  it('builds the span name from method and URL', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest({ method: 'POST' }));
    expect(result.name).toMatch(/^POST /);
  });

  describe('with span streaming enabled', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function mockStreamingClient(): void {
      vi.spyOn(currentScopes, 'getClient').mockReturnValue({
        getOptions: () => ({ traceLifecycle: 'stream' }),
        getDataCollectionOptions: () => ({ urlQueryParams: true }),
      } as unknown as Client);
    }

    it('drops the URL path but keeps the domain', () => {
      mockStreamingClient();
      const result = getOutgoingRequestSpanData(makeMockRequest({ method: 'post' }));
      expect(result.name).toBe('POST example.com');
    });

    it('falls back to `HTTP` when the request has no method', () => {
      mockStreamingClient();
      const result = getOutgoingRequestSpanData(makeMockRequest({ method: undefined }));
      expect(result.name).toBe('HTTP');
    });

    it('still records the URL on `url.full`', () => {
      mockStreamingClient();
      const result = getOutgoingRequestSpanData(makeMockRequest());
      expect(result.attributes![URL_FULL]).toBe('http://example.com/api/test');
    });
  });

  it('includes URL_FULL, HTTP_REQUEST_METHOD, URL_PATH, and server endpoint attributes', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest());
    expect(result.attributes).toMatchObject({
      [URL_FULL]: 'http://example.com/api/test',
      [HTTP_REQUEST_METHOD]: 'GET',
      [URL_PATH]: '/api/test',
      [SERVER_ADDRESS]: 'example.com',
      [SERVER_PORT]: 80,
    });
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
    expect(result.attributes!['user_agent.original']).toBeUndefined();
  });

  it('includes non-standard port in the URL', () => {
    const result = getOutgoingRequestSpanData(makeMockRequest({ port: 3000 }));
    expect(result.attributes![URL_FULL]).toContain(':3000');
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
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ 'network.protocol.version': '2.0' }));
  });

  it('sets http.response.status_text from statusMessage', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ statusMessage: 'Created' }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'http.response.status_text': 'CREATED' }),
    );
  });

  it('uses tcp transport for non-QUIC connections', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ httpVersion: '1.1' }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ [NETWORK_TRANSPORT]: 'tcp' }));
  });

  it('uses udp transport for QUIC connections', () => {
    const span = makeMockSpan();
    setIncomingResponseSpanData(makeMockResponse({ httpVersion: 'QUIC' }), span);
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ [NETWORK_TRANSPORT]: 'udp' }));
  });

  it('includes socket address and port attributes when socket is present', () => {
    const span = makeMockSpan();
    const response = makeMockResponse({
      socket: { remoteAddress: '1.2.3.4', remotePort: 12345 },
    });
    setIncomingResponseSpanData(response, span);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        [NETWORK_LOCAL_ADDRESS]: undefined,
        [NETWORK_LOCAL_PORT]: undefined,
        [NETWORK_PEER_ADDRESS]: '1.2.3.4',
        [NETWORK_PEER_PORT]: 12345,
      }),
    );
  });

  it('includes content-length as the encoded body size when content-encoding is identity', () => {
    const span = makeMockSpan();
    const response = makeMockResponse({
      headers: { 'content-length': '42', 'content-encoding': 'identity' },
    });
    setIncomingResponseSpanData(response, span);
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ 'http.response.body.size': 42 }));
  });

  it('includes content-length as the encoded body size when content-encoding is gzip', () => {
    const span = makeMockSpan();
    const response = makeMockResponse({
      headers: { 'content-length': '100', 'content-encoding': 'gzip' },
    });
    setIncomingResponseSpanData(response, span);
    expect(span.setAttributes).toHaveBeenCalledWith(expect.objectContaining({ 'http.response.body.size': 100 }));
  });
});
