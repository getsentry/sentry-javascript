import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as breadcrumbsModule from '../../../../src/breadcrumbs';
import { addOutgoingRequestBreadcrumb } from '../../../../src/integrations/http/add-outgoing-request-breadcrumb';
import type { HttpClientRequest, HttpIncomingMessage } from '../../../../src/integrations/http/types';

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
    resume: vi.fn(),
    on: vi.fn(),
    addListener: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  } as unknown as HttpIncomingMessage;
}

describe('addOutgoingRequestBreadcrumb', () => {
  beforeEach(() => {
    vi.spyOn(breadcrumbsModule, 'addBreadcrumb').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a breadcrumb with category "http" and type "http"', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest(), makeMockResponse());

    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledOnce();
    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'http', type: 'http' }),
      expect.anything(),
    );
  });

  it('includes sanitized URL, method, and status_code in data', () => {
    const request = makeMockRequest({ method: 'POST' });
    const response = makeMockResponse({ statusCode: 201 });

    addOutgoingRequestBreadcrumb(request, response);

    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: 'http://example.com/api/test',
          'http.method': 'POST',
          status_code: 201,
        }),
      }),
      expect.anything(),
    );
  });

  it('includes http.query when the URL has a query string', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest({ path: '/api/test?foo=bar' }), makeMockResponse());

    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ 'http.query': '?foo=bar' }),
      }),
      expect.anything(),
    );
    // The main URL in data.url should not contain the query string
    const callArg = vi.mocked(breadcrumbsModule.addBreadcrumb).mock.calls[0]![0];
    expect(callArg.data?.url).not.toContain('foo=bar');
  });

  it('does not include http.query when the URL has no query string', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest(), makeMockResponse());

    const callArg = vi.mocked(breadcrumbsModule.addBreadcrumb).mock.calls[0]![0];
    expect(callArg.data).not.toHaveProperty('http.query');
  });

  it('does not include http.fragment by default', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest(), makeMockResponse());

    const callArg = vi.mocked(breadcrumbsModule.addBreadcrumb).mock.calls[0]![0];
    expect(callArg.data).not.toHaveProperty('http.fragment');
  });

  it('sets level to "warning" for 4xx status codes', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest(), makeMockResponse({ statusCode: 404 }));

    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning' }),
      expect.anything(),
    );
  });

  it('sets level to "error" for 5xx status codes', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest(), makeMockResponse({ statusCode: 500 }));

    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
      expect.anything(),
    );
  });

  it('does not set level for 2xx status codes', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest(), makeMockResponse({ statusCode: 200 }));

    const callArg = vi.mocked(breadcrumbsModule.addBreadcrumb).mock.calls[0]![0];
    expect(callArg.level).toBeUndefined();
  });

  it('passes hint with event, request, and response', () => {
    const request = makeMockRequest();
    const response = makeMockResponse();

    addOutgoingRequestBreadcrumb(request, response);

    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledWith(expect.anything(), {
      event: 'response',
      request,
      response,
    });
  });

  it('handles undefined response (network error)', () => {
    const request = makeMockRequest();

    addOutgoingRequestBreadcrumb(request, undefined);

    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledOnce();
    const callArg = vi.mocked(breadcrumbsModule.addBreadcrumb).mock.calls[0]![0];
    expect(callArg.data?.status_code).toBeUndefined();
    expect(callArg.level).toBeUndefined();
    expect(breadcrumbsModule.addBreadcrumb).toHaveBeenCalledWith(expect.anything(), {
      event: 'response',
      request,
      response: undefined,
    });
  });

  it('defaults method to "GET" when request.method is undefined', () => {
    addOutgoingRequestBreadcrumb(makeMockRequest({ method: undefined }), makeMockResponse());

    const callArg = vi.mocked(breadcrumbsModule.addBreadcrumb).mock.calls[0]![0];
    expect(callArg.data?.['http.method']).toBe('GET');
  });
});
