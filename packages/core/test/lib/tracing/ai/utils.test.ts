import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient } from '../../../../src';
import { resolveAIRecordingOptions, wrapPromiseWithMethods } from '../../../../src/tracing/ai/utils';
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

  function setupWithSendDefaultPii(sendDefaultPii: boolean): void {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, sendDefaultPii });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }

  function setupWithDataCollection(genAI: { inputs?: boolean; outputs?: boolean }): void {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, dataCollection: { genAI } });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }

  it('defaults to false when no client is set', () => {
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: false, recordOutputs: false });
  });

  it('defaults to false when sendDefaultPii is false (bridge)', () => {
    setupWithSendDefaultPii(false);
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: false, recordOutputs: false });
  });

  it('defaults to true when sendDefaultPii is true (bridge)', () => {
    setupWithSendDefaultPii(true);
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: true, recordOutputs: true });
  });

  it('explicit options override sendDefaultPii bridge', () => {
    setupWithSendDefaultPii(true);
    expect(resolveAIRecordingOptions({ recordInputs: false })).toEqual({ recordInputs: false, recordOutputs: true });
  });

  it('respects dataCollection.genAI.inputs and outputs', () => {
    setupWithDataCollection({ inputs: true, outputs: true });
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: true, recordOutputs: true });
  });

  it('respects dataCollection.genAI.inputs: false, outputs: false', () => {
    setupWithDataCollection({ inputs: false, outputs: false });
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: false, recordOutputs: false });
  });

  it('supports asymmetric dataCollection.genAI (inputs: true, outputs: false)', () => {
    setupWithDataCollection({ inputs: true, outputs: false });
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: true, recordOutputs: false });
  });

  it('supports asymmetric dataCollection.genAI (inputs: false, outputs: true)', () => {
    setupWithDataCollection({ inputs: false, outputs: true });
    expect(resolveAIRecordingOptions()).toEqual({ recordInputs: false, recordOutputs: true });
  });

  it('explicit options override dataCollection.genAI', () => {
    setupWithDataCollection({ inputs: true, outputs: true });
    expect(resolveAIRecordingOptions({ recordInputs: false })).toEqual({ recordInputs: false, recordOutputs: true });
  });

  it('explicit false overrides dataCollection.genAI.inputs: true', () => {
    setupWithDataCollection({ inputs: true, outputs: true });
    expect(resolveAIRecordingOptions({ recordInputs: false, recordOutputs: false })).toEqual({
      recordInputs: false,
      recordOutputs: false,
    });
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
