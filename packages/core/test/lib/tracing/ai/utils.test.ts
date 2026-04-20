import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient } from '../../../../src';
import {
  resolveAIRecordingOptions,
  shouldEnableTruncation,
  wrapPromiseWithMethods,
} from '../../../../src/tracing/ai/utils';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('resolveAIRecordingOptions', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  function setup(sendDefaultPii: boolean): void {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, sendDefaultPii });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }

  it('defaults to false when sendDefaultPii is false', () => {
    setup(false);
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: false, recordOutputs: false });
  });

  it('respects sendDefaultPii: true', () => {
    setup(true);
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: true, recordOutputs: true });
  });

  it('explicit options override sendDefaultPii', () => {
    setup(true);
    expect(resolveAIRecordingOptions({ recordInputs: false })).toEqual({ recordInputs: false, recordOutputs: true });
  });
});

describe('shouldEnableTruncation', () => {
  it('defaults to false when the user did not set enableTruncation', () => {
    expect(shouldEnableTruncation(undefined)).toBe(false);
  });

  it('returns false when the user explicitly set enableTruncation: false', () => {
    expect(shouldEnableTruncation(false)).toBe(false);
  });

  it('returns true when the user explicitly set enableTruncation: true', () => {
    expect(shouldEnableTruncation(true)).toBe(true);
  });
});

describe('wrapPromiseWithMethods', () => {
  /**
   * Creates a mock APIPromise that mimics the behavior of OpenAI/Anthropic SDK APIPromise.
   * The returned object is a thenable with extra methods like .withResponse() and .asResponse().
   */
  function createMockAPIPromise<T>(value: T, metadata: { response: object; request_id: string }) {
    const resolvedPromise = Promise.resolve(value);
    const apiPromise = Object.assign(resolvedPromise, {
      withResponse: () =>
        Promise.resolve({
          data: value,
          response: metadata.response,
          request_id: metadata.request_id,
        }),
      asResponse: () => Promise.resolve(metadata.response),
    });
    return apiPromise;
  }

  it('routes .then() to instrumentedPromise', async () => {
    const original = createMockAPIPromise('original-data', {
      response: { status: 200 },
      request_id: 'req_123',
    });
    const instrumented = Promise.resolve('instrumented-data');
    const wrapped = wrapPromiseWithMethods(original, instrumented, 'auto.ai.test');

    const result = await wrapped;
    expect(result).toBe('instrumented-data');
  });

  it('routes .withResponse() to original and swaps data with instrumented result', async () => {
    const original = createMockAPIPromise('original-data', {
      response: { status: 200 },
      request_id: 'req_123',
    });
    const instrumented = Promise.resolve('instrumented-data');
    const wrapped = wrapPromiseWithMethods(original, instrumented, 'auto.ai.test');

    const withResponseResult = await (wrapped as typeof original).withResponse();
    expect(withResponseResult).toEqual({
      data: 'instrumented-data',
      response: { status: 200 },
      request_id: 'req_123',
    });
  });

  it('routes .asResponse() to original', async () => {
    const mockResponse = { status: 200, headers: new Map() };
    const original = createMockAPIPromise('original-data', {
      response: mockResponse,
      request_id: 'req_123',
    });
    const instrumented = Promise.resolve('instrumented-data');
    const wrapped = wrapPromiseWithMethods(original, instrumented, 'auto.ai.test');

    const response = await (wrapped as typeof original).asResponse();
    expect(response).toBe(mockResponse);
  });

  it('returns instrumentedPromise when original is not thenable', async () => {
    const instrumented = Promise.resolve('instrumented-data');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapPromiseWithMethods(null as any, instrumented, 'auto.ai.test');

    const result = await wrapped;
    expect(result).toBe('instrumented-data');
  });

  it('propagates errors from instrumentedPromise', async () => {
    const original = createMockAPIPromise('original-data', {
      response: { status: 200 },
      request_id: 'req_123',
    });
    const instrumented = Promise.reject(new Error('instrumented-error'));
    const wrapped = wrapPromiseWithMethods(original, instrumented, 'auto.ai.test');

    await expect(wrapped).rejects.toThrow('instrumented-error');
  });
});
