import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpan,
} from '../../../src';
import { instrumentOpenAiClient } from '../../../src/tracing/openai';
import { getSpanDescendants } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('instrumentOpenAiClient sendDefaultPii resolution', () => {
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

  function createFakeClient(): { chat: { completions: { create: (...args: unknown[]) => Promise<unknown> } } } {
    return {
      chat: {
        completions: {
          create: () =>
            Promise.resolve({
              id: 'chatcmpl-123',
              object: 'chat.completion',
              model: 'gpt-4',
              created: 1700000000,
              choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
            }),
        },
      },
    };
  }

  it('defaults recordInputs and recordOutputs to false when sendDefaultPii is false', async () => {
    setup(false);
    const proxy = instrumentOpenAiClient(createFakeClient());

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.chat.completions.create as Function)({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const descendants = getSpanDescendants(rootSpan);
      const aiSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.chat');
      expect(aiSpan).toBeDefined();

      const data = spanToJSON(aiSpan!).data;
      expect(data?.['gen_ai.input.messages']).toBeUndefined();
      expect(data?.['gen_ai.response.text']).toBeUndefined();
    });
  });

  it('respects sendDefaultPii: true', async () => {
    setup(true);
    const proxy = instrumentOpenAiClient(createFakeClient());

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.chat.completions.create as Function)({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const descendants = getSpanDescendants(rootSpan);
      const aiSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.chat');
      expect(aiSpan).toBeDefined();

      const data = spanToJSON(aiSpan!).data;
      expect(data?.['gen_ai.input.messages']).toBeDefined();
      expect(data?.['gen_ai.response.text']).toBeDefined();
    });
  });

  it('explicit options override sendDefaultPii', async () => {
    setup(true);
    const proxy = instrumentOpenAiClient(createFakeClient(), { recordInputs: false });

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.chat.completions.create as Function)({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const descendants = getSpanDescendants(rootSpan);
      const aiSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.chat');
      expect(aiSpan).toBeDefined();

      const data = spanToJSON(aiSpan!).data;
      // recordInputs explicitly false → no input messages
      expect(data?.['gen_ai.input.messages']).toBeUndefined();
      // recordOutputs still true from sendDefaultPii → response text present
      expect(data?.['gen_ai.response.text']).toBeDefined();
    });
  });
});
