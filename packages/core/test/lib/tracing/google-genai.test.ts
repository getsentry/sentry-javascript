import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpan,
} from '../../../src';
import { instrumentGoogleGenAIClient } from '../../../src/tracing/google-genai';
import { getSpanDescendants } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('instrumentGoogleGenAIClient sendDefaultPii resolution', () => {
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

  function createFakeClient(): { models: { generateContent: (...args: unknown[]) => Promise<unknown> } } {
    return {
      models: {
        generateContent: () =>
          Promise.resolve({
            modelVersion: 'gemini-2.0-flash',
            candidates: [{ content: { parts: [{ text: 'Hi!' }] } }],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
          }),
      },
    };
  }

  it('defaults recordInputs and recordOutputs to false when sendDefaultPii is false', async () => {
    setup(false);
    const proxy = instrumentGoogleGenAIClient(createFakeClient());

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.models.generateContent as Function)({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      });

      const descendants = getSpanDescendants(rootSpan);
      const aiSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.generate_content');
      expect(aiSpan).toBeDefined();

      const data = spanToJSON(aiSpan!).data;
      expect(data?.['gen_ai.input.messages']).toBeUndefined();
      expect(data?.['gen_ai.response.text']).toBeUndefined();
    });
  });

  it('respects sendDefaultPii: true', async () => {
    setup(true);
    const proxy = instrumentGoogleGenAIClient(createFakeClient());

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.models.generateContent as Function)({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      });

      const descendants = getSpanDescendants(rootSpan);
      const aiSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.generate_content');
      expect(aiSpan).toBeDefined();

      const data = spanToJSON(aiSpan!).data;
      expect(data?.['gen_ai.input.messages']).toBeDefined();
      expect(data?.['gen_ai.response.text']).toBeDefined();
    });
  });

  it('explicit options override sendDefaultPii', async () => {
    setup(true);
    const proxy = instrumentGoogleGenAIClient(createFakeClient(), { recordInputs: false });

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.models.generateContent as Function)({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      });

      const descendants = getSpanDescendants(rootSpan);
      const aiSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.generate_content');
      expect(aiSpan).toBeDefined();

      const data = spanToJSON(aiSpan!).data;
      // recordInputs explicitly false → no input messages
      expect(data?.['gen_ai.input.messages']).toBeUndefined();
      // recordOutputs still true from sendDefaultPii → response text present
      expect(data?.['gen_ai.response.text']).toBeDefined();
    });
  });
});
