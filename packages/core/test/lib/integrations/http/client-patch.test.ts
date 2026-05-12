import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTP_ON_CLIENT_REQUEST } from '../../../../src/integrations/http/constants';
import { patchHttpModuleClient } from '../../../../src/integrations/http/client-patch';
import type { HttpClientRequest, HttpExport } from '../../../../src/integrations/http/types';
import { getOriginalFunction } from '../../../../src/utils/object';

const mockClientRequestHandler = vi.fn();

vi.mock('../../../../src/integrations/http/client-subscriptions', () => ({
  getHttpClientSubscriptions: vi.fn(() => ({
    [HTTP_ON_CLIENT_REQUEST]: mockClientRequestHandler,
  })),
}));

function makeMockClientRequest(): HttpClientRequest {
  return {
    method: 'GET',
    path: '/api/test',
    host: 'example.com',
    protocol: 'http:',
    port: 80,
    end: vi.fn(),
    getHeader: vi.fn(() => undefined),
    getHeaders: vi.fn(() => ({})),
    setHeader: vi.fn(),
    removeHeader: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    prependListener: vi.fn(),
    listenerCount: vi.fn(() => 0),
    removeListener: vi.fn(),
  } as unknown as HttpClientRequest;
}

function makeMockHttpModule(): HttpExport & {
  request: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  const mockClientReq = makeMockClientRequest();
  const request = vi.fn(() => mockClientReq);
  const get = vi.fn(() => mockClientReq);
  return { request, get };
}

describe('patchHttpModuleClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces request with a wrapped version', () => {
    const httpModule = makeMockHttpModule();
    const originalRequest = httpModule.request;

    patchHttpModuleClient(httpModule);

    expect(httpModule.request).not.toBe(originalRequest);
  });

  it('preserves the original function via __sentry_original__', () => {
    const httpModule = makeMockHttpModule();
    const originalRequest = httpModule.request;

    patchHttpModuleClient(httpModule);

    expect(getOriginalFunction(httpModule.request)).toBe(originalRequest);
  });

  it('still calls the original request when the patched one is invoked', () => {
    const httpModule = makeMockHttpModule();
    const originalRequest = httpModule.request;

    patchHttpModuleClient(httpModule);
    httpModule.request('http://example.com/');

    expect(originalRequest).toHaveBeenCalledOnce();
  });

  it('returns the result of the original request', () => {
    const httpModule = makeMockHttpModule();

    patchHttpModuleClient(httpModule);
    const result = httpModule.request('http://example.com/');

    expect(result).toBeDefined();
  });

  it('invokes the subscription handler after each request', () => {
    const httpModule = makeMockHttpModule();

    patchHttpModuleClient(httpModule);
    httpModule.request('http://example.com/');

    expect(mockClientRequestHandler).toHaveBeenCalledOnce();
    expect(mockClientRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.any(Object) }),
      HTTP_ON_CLIENT_REQUEST,
    );
  });

  it('wraps get to call .end() on the returned request automatically', () => {
    const httpModule = makeMockHttpModule();
    const mockReq = makeMockClientRequest();
    httpModule.request = vi.fn(() => mockReq);

    patchHttpModuleClient(httpModule);
    httpModule.get('http://example.com/');

    expect(mockReq.end).toHaveBeenCalledOnce();
  });

  it('is idempotent — patching a second time does not re-wrap', () => {
    const httpModule = makeMockHttpModule();

    patchHttpModuleClient(httpModule);
    const wrappedRequest = httpModule.request;

    patchHttpModuleClient(httpModule);

    expect(httpModule.request).toBe(wrappedRequest);
  });

  it('handles CJS default export — patches the default and copies back to the container', () => {
    const httpDefault = makeMockHttpModule();
    const httpModule: HttpExport & { default: HttpExport } = {
      ...httpDefault,
      default: httpDefault,
    };
    const originalRequest = httpDefault.request;

    patchHttpModuleClient(httpModule);

    // The default export's request is now wrapped
    expect(getOriginalFunction(httpDefault.request)).toBe(originalRequest);
    // The module container's request descriptor was copied from the default
    expect(httpModule.request).toBe(httpDefault.request);
  });
});
