import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@sentry/core';
import * as core from '@sentry/core';

vi.mock('../../src/utils/utils', () => ({
  storeFormDataKeys: vi.fn(),
}));

import { storeFormDataKeys } from '../../src/utils/utils';
import { errorHandleDataFunction } from '../../src/server/errors';

function createMockClient(
  captureActionFormDataKeys: Record<string, string | boolean> | undefined,
  httpBodies: string[] = [],
): Client {
  return {
    getDataCollectionOptions: () => ({
      userInfo: false,
      cookies: true,
      httpHeaders: { request: true, response: true },
      httpBodies,
      urlQueryParams: true,
      graphQL: { document: true, variables: true },
      genAI: { inputs: true, outputs: true },
      databaseQueryData: true,
      stackFrameVariables: true,
      frameContextLines: 5,
    }),
    getOptions: () => ({ captureActionFormDataKeys }),
  } as unknown as Client;
}

describe('errorHandleDataFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures the configured keys when captureActionFormDataKeys is set', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient({ username: true }, ['incomingRequest']));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost', { method: 'POST' }) } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'action', mockArgs, mockSpan);

    expect(storeFormDataKeys).toHaveBeenCalledWith(mockArgs, mockSpan, { keys: { username: true } });
  });

  it('captures the configured keys even when httpBodies excludes incomingRequest', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient({ username: true }, []));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost', { method: 'POST' }) } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'action', mockArgs, mockSpan);

    expect(storeFormDataKeys).toHaveBeenCalledWith(mockArgs, mockSpan, { keys: { username: true } });
  });

  it('captures all fields when only httpBodies opts in', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient(undefined, ['incomingRequest']));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost', { method: 'POST' }) } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'action', mockArgs, mockSpan);

    expect(storeFormDataKeys).toHaveBeenCalledWith(mockArgs, mockSpan, { keys: undefined });
  });

  it('does NOT capture form data when neither option opts in', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient(undefined, []));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost', { method: 'POST' }) } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'action', mockArgs, mockSpan);

    expect(storeFormDataKeys).not.toHaveBeenCalled();
  });

  it('does NOT capture form data for loader functions', async () => {
    vi.spyOn(core, 'getClient').mockReturnValue(createMockClient({ username: true }, ['incomingRequest']));
    vi.spyOn(core, 'handleCallbackErrors').mockImplementation(async fn => fn());

    const mockSpan = { setAttribute: vi.fn() } as any;
    const mockArgs = { request: new Request('http://localhost') } as any;
    const origFn = vi.fn().mockResolvedValue(new Response());

    await errorHandleDataFunction.call(null, origFn, 'loader', mockArgs, mockSpan);

    expect(storeFormDataKeys).not.toHaveBeenCalled();
  });
});
