import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@sentry/core';
import * as core from '@sentry/core';

vi.mock('../../src/utils/utils', () => ({
  storeFormDataKeys: vi.fn(),
}));

import { storeFormDataKeys } from '../../src/utils/utils';
import { errorHandleDataFunction } from '../../src/server/errors';

function createMockClient(httpBodies: string[] = []): Client {
  return {
    getDataCollectionOptions: () => ({
      userInfo: false,
      cookies: true,
      httpHeaders: { request: true, response: true },
      httpBodies,
      queryParams: true,
      genAI: { inputs: true, outputs: true },
      stackFrameVariables: true,
      frameContextLines: 5,
    }),
    getOptions: () => ({
      captureActionFormDataKeys: { username: true },
    }),
  } as unknown as Client;
}

describe('errorHandleDataFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures form data when httpBodies includes incomingRequest', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient(['incomingRequest']));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost', { method: 'POST' }) } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'action', mockArgs, mockSpan);

    expect(storeFormDataKeys).toHaveBeenCalledWith(mockArgs, mockSpan, { username: true });
  });

  it('does NOT capture form data when httpBodies is empty', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient([]));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost', { method: 'POST' }) } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'action', mockArgs, mockSpan);

    expect(storeFormDataKeys).not.toHaveBeenCalled();
  });

  it('does NOT capture form data for loader functions', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient(['incomingRequest']));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost') } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'loader', mockArgs, mockSpan);

    expect(storeFormDataKeys).not.toHaveBeenCalled();
  });
});
