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

/**
 * Build a mock that mirrors the shape we patch: a module exposing a
 * `ClientRequest` constructor with a `_storeHeader` method on its prototype.
 */
function makeMockHttpModule(): HttpExport & {
  ClientRequest: { prototype: { _storeHeader: ReturnType<typeof vi.fn> } };
} {
  const _storeHeader = vi.fn();
  return {
    request: vi.fn(),
    get: vi.fn(),
    ClientRequest: { prototype: { _storeHeader } },
  } as unknown as HttpExport & { ClientRequest: { prototype: { _storeHeader: ReturnType<typeof vi.fn> } } };
}

describe('patchHttpModuleClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces ClientRequest.prototype._storeHeader with a wrapped version', () => {
    const httpModule = makeMockHttpModule();
    const originalStoreHeader = httpModule.ClientRequest.prototype._storeHeader;

    patchHttpModuleClient(httpModule);

    expect(httpModule.ClientRequest.prototype._storeHeader).not.toBe(originalStoreHeader);
  });

  it('preserves the original function via __sentry_original__', () => {
    const httpModule = makeMockHttpModule();
    const originalStoreHeader = httpModule.ClientRequest.prototype._storeHeader;

    patchHttpModuleClient(httpModule);

    expect(getOriginalFunction(httpModule.ClientRequest.prototype._storeHeader)).toBe(originalStoreHeader);
  });

  it('still calls the original _storeHeader when the patched one is invoked', () => {
    const httpModule = makeMockHttpModule();
    const originalStoreHeader = httpModule.ClientRequest.prototype._storeHeader;

    patchHttpModuleClient(httpModule);
    const request = {} as HttpClientRequest;
    const firstLine = 'GET / HTTP/1.1\r\n';
    const headers = {};
    httpModule.ClientRequest.prototype._storeHeader.call(request, firstLine, headers);

    expect(originalStoreHeader).toHaveBeenCalledOnce();
    expect(originalStoreHeader).toHaveBeenCalledWith(firstLine, headers);
  });

  it('invokes the subscription handler with the request on each _storeHeader call', () => {
    const httpModule = makeMockHttpModule();

    patchHttpModuleClient(httpModule);
    const request = { method: 'GET' } as HttpClientRequest;
    httpModule.ClientRequest.prototype._storeHeader.call(request, 'GET / HTTP/1.1\r\n', {});

    expect(mockClientRequestHandler).toHaveBeenCalledOnce();
    expect(mockClientRequestHandler).toHaveBeenCalledWith({ request }, HTTP_ON_CLIENT_REQUEST);
  });

  it('runs the handler before the original _storeHeader so headers can still be injected', () => {
    const httpModule = makeMockHttpModule();
    const originalStoreHeader = httpModule.ClientRequest.prototype._storeHeader;
    const callOrder: string[] = [];
    mockClientRequestHandler.mockImplementationOnce(() => callOrder.push('handler'));
    originalStoreHeader.mockImplementationOnce(() => callOrder.push('original'));

    patchHttpModuleClient(httpModule);
    httpModule.ClientRequest.prototype._storeHeader.call({} as HttpClientRequest, 'GET / HTTP/1.1\r\n', {});

    expect(callOrder).toEqual(['handler', 'original']);
  });

  it('still calls the original _storeHeader even if the handler throws', () => {
    const httpModule = makeMockHttpModule();
    const originalStoreHeader = httpModule.ClientRequest.prototype._storeHeader;
    mockClientRequestHandler.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    patchHttpModuleClient(httpModule);
    expect(() =>
      httpModule.ClientRequest.prototype._storeHeader.call({} as HttpClientRequest, 'GET / HTTP/1.1\r\n', {}),
    ).not.toThrow();
    expect(originalStoreHeader).toHaveBeenCalledOnce();
  });

  it('is idempotent — patching a second time does not re-wrap', () => {
    const httpModule = makeMockHttpModule();

    patchHttpModuleClient(httpModule);
    const wrappedStoreHeader = httpModule.ClientRequest.prototype._storeHeader;

    patchHttpModuleClient(httpModule);

    expect(httpModule.ClientRequest.prototype._storeHeader).toBe(wrappedStoreHeader);
  });

  it('is a no-op for modules without a ClientRequest (e.g. https)', () => {
    const httpModule = { request: vi.fn(), get: vi.fn() } as unknown as HttpExport;

    expect(() => patchHttpModuleClient(httpModule)).not.toThrow();
    expect(mockClientRequestHandler).not.toHaveBeenCalled();
  });

  it('handles a CJS default export by patching the default export', () => {
    const httpDefault = makeMockHttpModule();
    const httpModule: HttpExport & { default: HttpExport } = { default: httpDefault };
    const originalStoreHeader = httpDefault.ClientRequest.prototype._storeHeader;

    patchHttpModuleClient(httpModule);

    expect(getOriginalFunction(httpDefault.ClientRequest.prototype._storeHeader)).toBe(originalStoreHeader);
  });
});
