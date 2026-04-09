import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenAiClient } from '../../src';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, spanToJSON, startSpan } from '../../src';
import { GEN_AI_INPUT_MESSAGES_ATTRIBUTE } from '../../src/tracing/ai/gen-ai-attributes';
import { instrumentOpenAiClient } from '../../src/tracing/openai';
import type { Span } from '../../src/types-hoist/span';
import { getSpanDescendants } from '../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

function createMockOpenAiClient() {
  return {
    chat: {
      completions: {
        create: async (params: { model: string; messages: Array<{ role: string; content: string }> }) => ({
          id: 'chatcmpl-test',
          model: params.model,
          choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      },
    },
    responses: {
      create: async (params: { model: string; input: string }) => ({
        id: 'resp-test',
        object: 'response',
        model: params.model,
        output_text: 'Response text',
        status: 'completed',
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      }),
    },
  };
}

type MockClient = ReturnType<typeof createMockOpenAiClient>;

describe('OpenAI enableTruncation option', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  async function callWithOptions(
    options: { recordInputs?: boolean; enableTruncation?: boolean },
    input: Array<{ role: string; content: string }> | string,
  ): Promise<string | undefined> {
    const mockClient = createMockOpenAiClient();
    const instrumented = instrumentOpenAiClient(mockClient as unknown as OpenAiClient, options) as MockClient;

    let rootSpan: Span | undefined;

    await startSpan({ name: 'test' }, async span => {
      rootSpan = span;
      if (typeof input === 'string') {
        await instrumented.responses.create({ model: 'gpt-4', input });
      } else {
        await instrumented.chat.completions.create({ model: 'gpt-4', messages: input });
      }
    });

    const spans = getSpanDescendants(rootSpan!);
    const aiSpan = spans.find(s => spanToJSON(s).op === 'gen_ai.chat');
    return spanToJSON(aiSpan!).data?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] as string | undefined;
  }

  const longContent = 'A'.repeat(200_000);
  const messages = [{ role: 'user', content: longContent }];

  it('truncates input messages by default', async () => {
    const inputMessages = await callWithOptions({ recordInputs: true }, messages);
    expect(inputMessages).toBeDefined();
    expect(inputMessages!.length).toBeLessThan(longContent.length);
  });

  it('truncates input messages when enableTruncation is true', async () => {
    const inputMessages = await callWithOptions({ recordInputs: true, enableTruncation: true }, messages);
    expect(inputMessages).toBeDefined();
    expect(inputMessages!.length).toBeLessThan(longContent.length);
  });

  it('does not truncate input messages when enableTruncation is false', async () => {
    const inputMessages = await callWithOptions({ recordInputs: true, enableTruncation: false }, messages);
    expect(inputMessages).toBeDefined();

    const parsed = JSON.parse(inputMessages!);
    expect(parsed).toEqual(messages);
  });

  it('does not wrap string input in quotes when enableTruncation is false', async () => {
    const stringInput = 'Translate this to French: Hello';
    const inputMessages = await callWithOptions({ recordInputs: true, enableTruncation: false }, stringInput);
    expect(inputMessages).toBe(stringInput);
  });
});
