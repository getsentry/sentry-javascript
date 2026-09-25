import * as Sentry from '@sentry/node';
import { embed, embedMany, generateText, streamText } from 'ai';
import { MockEmbeddingModelV3, MockLanguageModelV3, simulateReadableStream } from 'ai/test';

const usage = {
  inputTokens: { total: 10, noCache: 10, cached: 0 },
  outputTokens: { total: 20, noCache: 20, cached: 0 },
  totalTokens: { total: 30, noCache: 30, cached: 0 },
};

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'support-chat',
        metadata: { requestId: 'req_generate', tenantId: 'acme' },
      },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          content: [{ type: 'text', text: 'Hello!' }],
          warnings: [],
        }),
      }),
      prompt: 'Hi',
    });

    const result = streamText({
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'support-stream',
        metadata: { requestId: 'req_stream', tenantId: 'acme' },
      },
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'Hello!' },
              { type: 'text-end', id: '0' },
              { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
            ],
          }),
        }),
      }),
      prompt: 'Hi',
    });
    for await (const _part of result.fullStream) {
      void _part;
    }

    await embed({
      experimental_telemetry: { isEnabled: true, metadata: { requestId: 'req_embed', tenantId: 'acme' } },
      model: new MockEmbeddingModelV3({
        doEmbed: async () => ({ embeddings: [[0.1, 0.2, 0.3]], usage: { tokens: 10 } }),
      }),
      value: 'Embed me',
    });

    await embedMany({
      experimental_telemetry: { isEnabled: true, metadata: { requestId: 'req_embed_many', tenantId: 'acme' } },
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: 5,
        doEmbed: async () => ({
          embeddings: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
          ],
          usage: { tokens: 20 },
        }),
      }),
      values: ['First', 'Second'],
    });
  });

  await Sentry.flush(2000);
}

run();
