import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpan,
} from '../../../src';
import { instrumentAnthropicAiClient } from '../../../src/tracing/anthropic-ai';
import { getSpanDescendants } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('instrumentAnthropicAiClient sendDefaultPii resolution', () => {
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

  function createFakeClient(): { messages: { create: (...args: unknown[]) => Promise<unknown> } } {
    return {
      messages: {
        create: () =>
          Promise.resolve({
            id: 'msg_123',
            type: 'message',
            model: 'claude-3-opus-20240229',
            content: [{ type: 'text', text: 'Hi!' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      },
    };
  }

  it('defaults recordInputs and recordOutputs to false when sendDefaultPii is false', async () => {
    setup(false);
    const proxy = instrumentAnthropicAiClient(createFakeClient());

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.messages.create as Function)({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
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
    const proxy = instrumentAnthropicAiClient(createFakeClient());

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.messages.create as Function)({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
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
    const proxy = instrumentAnthropicAiClient(createFakeClient(), { recordInputs: false });

    await startSpan({ name: 'test-root' }, async rootSpan => {
      await (proxy.messages.create as Function)({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
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
