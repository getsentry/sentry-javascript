import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: { total: 10, noCache: 10, cached: 0 },
  outputTokens: { total: 5, noCache: 5, cached: 0 },
  totalTokens: { total: 15, noCache: 15, cached: 0 },
};

const textModel = new MockLanguageModelV3({
  doGenerate: async () => ({
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    content: [{ type: 'text', text: 'Hello!' }],
    warnings: [],
    // A per-response id: present on every turn, never the conversation id.
    providerMetadata: { openai: { responseId: 'resp_turn' } },
  }),
});

const toolCallModel = new MockLanguageModelV3({
  doGenerate: async () => ({
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage,
    content: [{ type: 'tool-call', toolCallId: 'tc-1', toolName: 'echo', input: JSON.stringify({ text: 'hi' }) }],
    warnings: [],
  }),
});

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // A turn of an OpenAI Conversations API conversation.
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: textModel,
      prompt: 'First turn',
      providerOptions: { openai: { conversation: 'conv_abc123' } },
    });

    // The Azure Responses API carries the same option under the `azure` key; this turn also runs a tool.
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: toolCallModel,
      prompt: 'Second turn',
      providerOptions: { azure: { conversation: 'conv_azure' } },
      tools: {
        echo: tool({
          inputSchema: z.object({ text: z.string() }),
          execute: async ({ text }) => text,
        }),
      },
    });

    // Chaining on the previous response names a response, not a thread, so no conversation id.
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: textModel,
      prompt: 'Chained turn',
      providerOptions: { openai: { previousResponseId: 'resp_turn' } },
    });

    // An id set through the SDK API wins over the provider option. Last, since it stays on the scope.
    Sentry.setConversationId('conv-from-api');
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: textModel,
      prompt: 'API turn',
      providerOptions: { openai: { conversation: 'conv_ignored' } },
    });
  });
}

run();
