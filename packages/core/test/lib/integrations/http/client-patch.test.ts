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
 * `ClientRequest` constructor with an `onSocket` method on its prototype.
 */
function makeMockHttpModule(): HttpExport & {
  ClientRequest: { prototype: { onSocket: ReturnType<typeof vi.fn> } };
} {
  const onSocket = vi.fn();
  return {
    request: vi.fn(),
    get: vi.fn(),
    ClientRequest: { prototype: { onSocket } },
  } as unknown as HttpExport & { ClientRequest: { prototype: { onSocket: ReturnType<typeof vi.fn> } } };
}

describe('patchHttpModuleClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces ClientRequest.prototype.onSocket with a wrapped version', () => {
    const httpModule = makeMockHttpModule();
    const originalOnSocket = httpModule.ClientRequest.prototype.onSocket;

    patchHttpModuleClient(httpModule);

    expect(httpModule.ClientRequest.prototype.onSocket).not.toBe(originalOnSocket);
  });

  it('preserves the original function via __sentry_original__', () => {
    const httpModule = makeMockHttpModule();
    const originalOnSocket = httpModule.ClientRequest.prototype.onSocket;

    patchHttpModuleClient(httpModule);

    expect(getOriginalFunction(httpModule.ClientRequest.prototype.onSocket)).toBe(originalOnSocket);
  });

  it('still calls the original onSocket when the patched one is invoked', () => {
    const httpModule = makeMockHttpModule();
    const originalOnSocket = httpModule.ClientRequest.prototype.onSocket;

    patchHttpModuleClient(httpModule);
    const request = {} as HttpClientRequest;
    const socket = {};
    httpModule.ClientRequest.prototype.onSocket.call(request, socket);

    expect(originalOnSocket).toHaveBeenCalledOnce();
    expect(originalOnSocket).toHaveBeenCalledWith(socket);
  });

  it('invokes the subscription handler with the request on each onSocket call', () => {
    const httpModule = makeMockHttpModule();

    patchHttpModuleClient(httpModule);
    const request = { method: 'GET' } as HttpClientRequest;
    httpModule.ClientRequest.prototype.onSocket.call(request, {});

    expect(mockClientRequestHandler).toHaveBeenCalledOnce();
    expect(mockClientRequestHandler).toHaveBeenCalledWith({ request }, HTTP_ON_CLIENT_REQUEST);
  });

  it('still calls the original onSocket even if the handler throws', () => {
    const httpModule = makeMockHttpModule();
    const originalOnSocket = httpModule.ClientRequest.prototype.onSocket;
    mockClientRequestHandler.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    patchHttpModuleClient(httpModule);
    expect(() => httpModule.ClientRequest.prototype.onSocket.call({} as HttpClientRequest, {})).not.toThrow();
    expect(originalOnSocket).toHaveBeenCalledOnce();
  });

  it('is idempotent — patching a second time does not re-wrap', () => {
    const httpModule = makeMockHttpModule();

    patchHttpModuleClient(httpModule);
    const wrappedOnSocket = httpModule.ClientRequest.prototype.onSocket;

    patchHttpModuleClient(httpModule);

    expect(httpModule.ClientRequest.prototype.onSocket).toBe(wrappedOnSocket);
  });

  it('is a no-op for modules without a ClientRequest (e.g. https)', () => {
    const httpModule = { request: vi.fn(), get: vi.fn() } as unknown as HttpExport;

    expect(() => patchHttpModuleClient(httpModule)).not.toThrow();
    expect(mockClientRequestHandler).not.toHaveBeenCalled();
  });

  it('handles a CJS default export by patching the default export', () => {
    const httpDefault = makeMockHttpModule();
    const httpModule: HttpExport & { default: HttpExport } = { default: httpDefault };
    const originalOnSocket = httpDefault.ClientRequest.prototype.onSocket;

    patchHttpModuleClient(httpModule);

    expect(getOriginalFunction(httpDefault.ClientRequest.prototype.onSocket)).toBe(originalOnSocket);
  });
});
